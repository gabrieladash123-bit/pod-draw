# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from datetime import datetime, timezone
from hashlib import sha256
from itertools import combinations
import json
import re


CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
RELAYS = ('https://api.drand.sh/', 'https://api2.drand.sh/')
GENESIS = 1692803367
PERIOD = 3
DELAY = 120
ZERO = Address('0x0000000000000000000000000000000000000000')


def fail(message):
    raise gl.vm.UserError(message)


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def now():
    return int(datetime.now(timezone.utc).timestamp())


def pair_key(left, right):
    return str(left) + '-' + str(right)


def feasible(domains, history):
    """Return every cheapest labeled bipartition, in increasing alpha mask order."""
    count = len(domains)
    candidates = []
    best = None
    for alpha in combinations(range(count), (count + 1) // 2):
        alpha_set = set(alpha)
        beta = [index for index in range(count) if index not in alpha_set]
        pods = [list(alpha), beta]
        if any(len({domains[index] for index in pod}) != len(pod) for pod in pods):
            continue
        cost = sum(history.get(pair_key(left, right), 0)
                   for pod in pods for left, right in combinations(pod, 2))
        mask = sum(1 << index for index in alpha)
        if best is None or cost < best:
            best, candidates = cost, [mask]
        elif cost == best:
            candidates.append(mask)
    return {'cost': best, 'masks': sorted(candidates)}


def sample_index(seed, count):
    # Rejection avoids modulo bias. The counter extends the same immutable seed.
    ceiling = (1 << 256) - ((1 << 256) % count)
    for counter in range(64):
        word = int.from_bytes(sha256(seed + counter.to_bytes(4, 'big')).digest(), 'big')
        if word < ceiling:
            return {'index': word % count, 'counter': counter}
    fail('Randomness expansion exhausted')


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail('[EXTERNAL] Duplicate beacon field')
        result[key] = value
    return result


def normalize_beacon(response):
    if response.status != 200:
        fail('[EXTERNAL] Beacon unavailable')
    if len(response.body) > 4096:
        fail('[EXTERNAL] Invalid beacon')
    try:
        data = json.loads(response.body.decode('utf-8'), object_pairs_hook=unique_fields)
    except (ValueError, UnicodeError):
        fail('[EXTERNAL] Invalid beacon')
    if not isinstance(data, dict) or type(data.get('round')) is not int or data['round'] < 1:
        fail('[EXTERNAL] Invalid beacon')
    signature, randomness = data.get('signature'), data.get('randomness')
    if (not isinstance(signature, str) or re.fullmatch('[0-9a-f]{96}', signature) is None
            or not isinstance(randomness, str) or re.fullmatch('[0-9a-f]{64}', randomness) is None
            or sha256(bytes.fromhex(signature)).hexdigest() != randomness):
        fail('[EXTERNAL] Invalid beacon')
    return {'round': data['round'], 'signature': signature, 'randomness': randomness}


def observations(left, right, target, future):
    first, second = normalize_beacon(left), normalize_beacon(right)
    if future:
        if first['round'] >= target or second['round'] >= target:
            fail('[EXTERNAL] Beacon no longer future')
        return {'before_round': target}
    if first['round'] != target or second['round'] != target:
        fail('[EXTERNAL] Wrong beacon round')
    if first != second:
        fail('[EXTERNAL] Relay disagreement')
    return first


def observe(target, future=False):
    suffix = 'latest' if future else str(target)
    first_url = RELAYS[0] + CHAIN + '/public/' + suffix
    second_url = RELAYS[1] + CHAIN + '/public/' + suffix

    def lead():
        return observations(gl.nondet.web.get(first_url), gl.nondet.web.get(second_url), target, future)

    def verify(proposal):
        try:
            independent = observations(gl.nondet.web.get(first_url), gl.nondet.web.get(second_url), target, future)
        except gl.vm.UserError as error:
            return not isinstance(proposal, gl.vm.Return) and getattr(proposal, 'message', None) == error.message
        except Exception:
            return False
        return isinstance(proposal, gl.vm.Return) and encode(proposal.calldata) == encode(independent)

    return gl.vm.run_nondet_unsafe(lead, verify)


class PodDraw(gl.Contract):
    members: DynArray[Address]
    domains: DynArray[str]
    approvals: TreeMap[Address, bool]
    pairings: TreeMap[str, u256]
    results: DynArray[str]
    phase: str
    target: u256
    sealed_at: u256

    def __init__(self, members: list[Address], domains: list[str]):
        if not 4 <= len(members) <= 8 or len(members) != len(domains):
            fail('Expected four to eight members and domains')
        normalized = [value if isinstance(value, Address) else Address(value) for value in members]
        if ZERO in normalized or len(set(normalized)) != len(normalized):
            fail('Expected distinct nonzero member wallets')
        if any(re.fullmatch('[a-z][a-z0-9-]{0,23}', domain) is None for domain in domains):
            fail('Invalid fault-domain label')
        if not feasible(domains, {})['masks']:
            fail('No domain-separated partition')
        for wallet, domain in zip(normalized, domains):
            self.members.append(wallet)
            self.domains.append(domain)
        self.phase = 'OPEN'
        self.target = u256(0)
        self.sealed_at = u256(0)

    def _member(self):
        sender = gl.message.sender_address
        if sender not in list(self.members):
            fail('Only a registered member')
        if self.phase != 'OPEN':
            fail('Roster is sealed')
        return sender

    def _history(self):
        return {pair_key(left, right): int(self.pairings[pair_key(left, right)])
                if pair_key(left, right) in self.pairings else 0
                for left, right in combinations(range(len(self.members)), 2)}

    @gl.public.write
    def approve(self) -> None:
        sender = self._member()
        if sender in self.approvals and self.approvals[sender]:
            fail('Already approved')
        self.approvals[sender] = True

    @gl.public.write
    def withdraw(self) -> None:
        sender = self._member()
        if sender not in self.approvals or not self.approvals[sender]:
            fail('Approval is absent')
        self.approvals[sender] = False

    @gl.public.write
    def seal(self) -> None:
        if self.phase != 'OPEN':
            fail('Round is already sealed')
        if len(self.results) >= 32:
            fail('Round limit reached')
        if not all(wallet in self.approvals and self.approvals[wallet] for wallet in self.members):
            fail('Every member must approve')
        timestamp = now()
        target = (timestamp + DELAY - GENESIS + PERIOD - 1) // PERIOD + 1
        observe(target, future=True)
        self.target = u256(target)
        self.sealed_at = u256(timestamp)
        self.phase = 'SEALED'

    @gl.public.write
    def draw(self) -> None:
        if self.phase != 'SEALED':
            fail('No sealed round')
        target = int(self.target)
        if now() < GENESIS + (target - 1) * PERIOD:
            fail('Beacon is not due')
        beacon = observe(target)
        history = self._history()
        space = feasible(list(self.domains), history)
        round_number = len(self.results) + 1
        roster = [[str(wallet).lower(), domain] for wallet, domain in zip(self.members, self.domains)]
        context = encode({'contract': str(gl.message.contract_address).lower(),
                          'round': round_number, 'roster': roster, 'history': history})
        seed = b'PodDraw/v1\0' + context.encode() + b'\0' + bytes.fromhex(beacon['randomness'])
        pick = sample_index(seed, len(space['masks']))
        mask = space['masks'][pick['index']]
        pods = [[index for index in range(len(self.members)) if bool(mask & (1 << index)) == alpha]
                for alpha in (True, False)]
        result = {'round': round_number, 'target': target, 'sealed_at': int(self.sealed_at),
                  'beacon': beacon, 'chain_hash': CHAIN, 'context': context,
                  'eligible_masks': space['masks'], 'minimum_repeat_cost': space['cost'],
                  'index': pick['index'], 'counter': pick['counter'], 'pods': pods}
        for pod in pods:
            for left, right in combinations(pod, 2):
                key = pair_key(left, right)
                self.pairings[key] = u256(history[key] + 1)
        self.results.append(encode(result))
        self.phase = 'OPEN'
        self.target = u256(0)
        self.sealed_at = u256(0)

    @gl.public.view
    def state(self) -> dict:
        return {'members': [str(wallet).lower() for wallet in self.members],
                'domains': list(self.domains),
                'approvals': [wallet in self.approvals and self.approvals[wallet] for wallet in self.members],
                'pairings': self._history(), 'rounds': len(self.results), 'phase': self.phase,
                'target': int(self.target), 'sealed_at': int(self.sealed_at),
                'target_time': GENESIS + (int(self.target) - 1) * PERIOD if self.target else 0}

    @gl.public.view
    def result(self, round_number: int) -> dict:
        if not 1 <= round_number <= len(self.results):
            fail('Round result is absent')
        return json.loads(self.results[round_number - 1])
