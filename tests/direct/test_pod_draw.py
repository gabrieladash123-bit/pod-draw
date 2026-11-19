from datetime import datetime, timezone
from hashlib import sha256
from itertools import combinations, product
import ast
import json
from pathlib import Path

import pytest


SOURCE = Path('contracts/pod_draw.py')
GENESIS = 1692803367
START = '2026-11-18T00:00:00+00:00'


def beacon(round_number, byte=7):
    signature = bytes([byte]) * 48
    return {'round': round_number, 'signature': signature.hex(), 'randomness': sha256(signature).hexdigest()}


def mocks(vm, data=None, status=200, second=None):
    vm.clear_mocks()
    for host, value in [('api.drand.sh', data), ('api2.drand.sh', second if second is not None else data)]:
        vm.mock_web(host.replace('.', r'\.') + r'/.*/public/.*',
                    {'status': status, 'body': json.dumps(value or beacon(100)).encode()})


def deploy(vm, direct_deploy, direct_accounts, count=6):
    vm.warp(START)
    domains = ['a','a','b','b','c','c','d','d'][:count]
    return direct_deploy(str(SOURCE), list(direct_accounts[:count]), domains, sdk_version='v0.2.16')


def approve_all(contract, vm, accounts):
    for member in accounts[:6]:
        vm.sender = member
        contract.approve()


def ready_to_draw(contract, vm):
    state = contract.state()
    vm.warp(datetime.fromtimestamp(state['target_time'] + 1, timezone.utc).isoformat())
    mocks(vm, beacon(state['target']))
    return state


def oracle(domains, history):
    options = []
    for bits in product((0, 1), repeat=len(domains)):
        if sum(bits) != (len(domains) + 1) // 2:
            continue
        groups = [[index for index, side in enumerate(bits) if side == pod] for pod in (1, 0)]
        if any(len(set(domains[index] for index in group)) != len(group) for group in groups):
            continue
        cost = sum(history.get(f'{a}-{b}', 0) for group in groups for a, b in combinations(group, 2))
        options.append((cost, sum(bit << index for index, bit in enumerate(bits))))
    if not options:
        return {'cost': None, 'masks': []}
    best = min(cost for cost, _ in options)
    return {'cost': best, 'masks': sorted(mask for cost, mask in options if cost == best)}


def test_consent_future_lock_three_draws_and_pairing_memory(direct_vm, direct_deploy, direct_accounts):
    contract = deploy(direct_vm, direct_deploy, direct_accounts)
    with direct_vm.expect_revert('Every member must approve'):
        contract.seal()
    approve_all(contract, direct_vm, direct_accounts)
    for round_number in range(1, 4):
        before = contract.state()
        mocks(direct_vm)
        contract.seal()
        locked = contract.state()
        assert locked['phase'] == 'SEALED'
        assert 120 <= locked['target_time'] - locked['sealed_at'] < 123
        assert direct_vm.run_validator() is True
        with direct_vm.expect_revert('Roster is sealed'):
            contract.withdraw()
        with direct_vm.expect_revert('Beacon is not due'):
            contract.draw()
        ready_to_draw(contract, direct_vm)
        contract.draw()
        assert direct_vm.run_validator() is True
        result = contract.result(round_number)
        expected = oracle(before['domains'], before['pairings'])
        assert result['eligible_masks'] == expected['masks']
        assert result['minimum_repeat_cost'] == expected['cost']
        selected = sum(1 << index for index in result['pods'][0])
        assert selected == expected['masks'][result['index']]
        assert sorted(result['pods'][0] + result['pods'][1]) == list(range(6))
        after = contract.state()
        new_history = dict(before['pairings'])
        for group in result['pods']:
            for left, right in combinations(group, 2):
                new_history[f'{left}-{right}'] += 1
        assert after['pairings'] == new_history
        assert after['phase'] == 'OPEN' and after['rounds'] == round_number
        with direct_vm.expect_revert('No sealed round'):
            contract.draw()
    assert contract.result(1)['minimum_repeat_cost'] == 0
    assert contract.result(2)['minimum_repeat_cost'] == 2


def test_validator_checks_actual_round_signature_and_both_relays(direct_vm, direct_deploy, direct_accounts):
    contract = deploy(direct_vm, direct_deploy, direct_accounts)
    approve_all(contract, direct_vm, direct_accounts)
    mocks(direct_vm)
    contract.seal()
    locked = ready_to_draw(contract, direct_vm)
    contract.draw()
    actual = beacon(locked['target'])
    assert direct_vm.run_validator(leader_result={**actual, 'randomness': '0'*64}) is False
    assert direct_vm.run_validator(leader_result=beacon(locked['target'] - 1)) is False
    mocks(direct_vm, actual, second=beacon(locked['target'], 8))
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize('bad', ['missing','wrong-round','wrong-hash','disagree'])
def test_failed_beacon_retries_keep_fixed_round(direct_vm, direct_deploy, direct_accounts, bad):
    contract = deploy(direct_vm, direct_deploy, direct_accounts)
    approve_all(contract, direct_vm, direct_accounts)
    mocks(direct_vm)
    contract.seal()
    locked = ready_to_draw(contract, direct_vm)
    value = beacon(locked['target'])
    if bad == 'missing':
        mocks(direct_vm, status=404)
    elif bad == 'wrong-round':
        mocks(direct_vm, beacon(locked['target'] + 1))
    elif bad == 'wrong-hash':
        mocks(direct_vm, {**value, 'randomness': '0'*64})
    else:
        mocks(direct_vm, value, second=beacon(locked['target'], 9))
    with direct_vm.expect_revert():
        contract.draw()
    assert contract.state() == locked
    mocks(direct_vm, value)
    contract.draw()
    assert contract.result(1)['target'] == locked['target']


def test_future_gate_rejects_an_already_observed_target(direct_vm, direct_deploy, direct_accounts):
    contract = deploy(direct_vm, direct_deploy, direct_accounts)
    approve_all(contract, direct_vm, direct_accounts)
    before = contract.state()
    mocks(direct_vm, beacon(10**12))
    with direct_vm.expect_revert('[EXTERNAL] Beacon no longer future'):
        contract.seal()
    assert contract.state() == before


def test_membership_withdrawal_and_reapproval(direct_vm, direct_deploy, direct_accounts):
    contract = deploy(direct_vm, direct_deploy, direct_accounts, count=4)
    direct_vm.sender = direct_accounts[4]
    with direct_vm.expect_revert('Only a registered member'):
        contract.approve()
    direct_vm.sender = direct_accounts[0]
    contract.approve()
    with direct_vm.expect_revert('Already approved'):
        contract.approve()
    contract.withdraw()
    with direct_vm.expect_revert('Approval is absent'):
        contract.withdraw()
    contract.approve()
    assert contract.state()['approvals'] == [True, False, False, False]


@pytest.mark.parametrize('case', ['few','many','duplicate','zero','domain','infeasible'])
def test_invalid_roster_rejected(direct_vm, direct_deploy, direct_accounts, case):
    members = list(direct_accounts[:4])
    domains = ['a','a','b','b']
    if case == 'few':
        members, domains = members[:3], domains[:3]
    elif case == 'many':
        members, domains = [bytes([i+1])*20 for i in range(9)], list('abcdefghi')
    elif case == 'duplicate':
        members[1] = members[0]
    elif case == 'zero':
        members[0] = bytes(20)
    elif case == 'domain':
        domains[0] = 'Invalid Domain'
    else:
        domains = ['a'] * 4
    with direct_vm.expect_revert():
        direct_deploy(str(SOURCE), members, domains, sdk_version='v0.2.16')


def test_native_address_constructor(direct_vm, direct_deploy, direct_accounts, monkeypatch):
    from gltest.direct import loader
    original = loader._calldata_roundtrip_args

    def typed(args, kwargs):
        args, kwargs = original(args, kwargs)
        if len(args) == 2:
            from genlayer import Address
            args = ([Address(wallet) for wallet in args[0]], args[1])
        return args, kwargs

    monkeypatch.setattr(loader, '_calldata_roundtrip_args', typed)
    contract = deploy(direct_vm, direct_deploy, direct_accounts)
    assert contract.state()['members'] == ['0x'+wallet.hex() for wallet in direct_accounts[:6]]


def test_partition_optimizer_against_independent_binary_assignment_oracle():
    tree = ast.parse(SOURCE.read_text())
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                and node.name in ('pair_key', 'feasible')]
    namespace = {'combinations': combinations}
    exec(compile(ast.Module(body=selected, type_ignores=[]), '<partition>', 'exec'), namespace)
    for count in range(4, 9):
        for seed in range(80):
            domains = [str((seed // (index + 1) + index * seed) % max(2, (count+1)//2)) for index in range(count)]
            history = {f'{a}-{b}': (seed*17+a*7+b*3) % 9 for a,b in combinations(range(count),2)}
            assert namespace['feasible'](domains, history) == oracle(domains, history)


def test_rejection_sampler_skips_out_of_range_word():
    tree = ast.parse(SOURCE.read_text())
    node = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'sample_index')
    words = iter([b'\xff'*32, bytes(32)])

    class Hash:
        def digest(self):
            return next(words)

    namespace = {'sha256': lambda _: Hash(), 'fail': lambda reason: pytest.fail(reason)}
    exec(compile(ast.Module(body=[node], type_ignores=[]), '<sample>', 'exec'), namespace)
    assert namespace['sample_index'](b'seed', 3) == {'index': 0, 'counter': 1}
