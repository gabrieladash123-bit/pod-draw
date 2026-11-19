# PodDraw

PodDraw assigns a fixed roster to two labeled pods over repeated rounds. Members from the same configured fault domain must be separated. Among feasible balanced partitions, the contract minimizes the total number of previous meetings of same-pod pairs, then samples uniformly among tied optima using a fixed future drand beacon round.

Deployed on gasless GenLayer StudioNet at [0x2B53ca2D6b5AF1586b5a17CDFD7Cfc4bc69253B3](https://explorer-studio.genlayer.com/address/0x2B53ca2D6b5AF1586b5a17CDFD7Cfc4bc69253B3). [Deployment transaction](https://explorer-studio.genlayer.com/tx/0x7a2fc49351f55c129d1e1b5faee6164723e2df8b6f8181e81e2f9f9d44031459) · [Nineteen finalized receipts and three draws](proofs/README.md) · [Submission text](SUBMISSION.md).

## State and consent

Deploy with 4–8 distinct signing wallets and matching domain labels. Every wallet must approve participation. Consent continues across rounds until withdrawn while OPEN. Anyone may seal a unanimously approved roster. Sealing selects the first quicknet round scheduled at least 120 seconds after the transaction timestamp and independently checks both relays' latest published rounds are earlier.

SEALED locks consent, the roster, pairing history and target round until a successful draw. Once due, anyone draws. Failed source retrieval leaves the same target locked for retry. Successful draws append an immutable result, increment each co-pod pair's meeting count and reopen consent. Each instance supports at most 32 draws.

The two pods have ceiling(n/2) and floor(n/2) members. Alpha and beta are distinct labels. All feasible alpha membership masks are enumerated in increasing numeric order. The selected mask is sampled from the complete minimum-cost set. SHA-256 expansion includes the contract, roster, draw number, prior pair counts and beacon randomness. Rejection sampling avoids modulo bias.

## GenLayer consensus

For each source observation, leader and validators independently fetch full responses from api.drand.sh and api2.drand.sh using the fixed quicknet chain hash. They check round, signature length, randomness digest, provider agreement and the same future-round gate. The accepted randomness changes the stored partition and future pairing costs.

The contract uses GenLayer web consensus over the two HTTPS relays for beacon authenticity. Its signature-to-randomness hash check verifies internal consistency. Full BLS signature verification is performed separately by the proof tooling, using the pinned quicknet public key. The relays serve the same drand network. Configured fault-domain labels are participant-approved policy inputs. The contract assigns pods under those inputs and does not measure physical infrastructure independence.

The future gate assumes relays promptly publish their latest round and that GenLayer's transaction timestamps are accurate. Fairness also requires sealing to become final before the target beacon is published. This instance uses a 120-second scheduling buffer. The fixed target prevents retry callers from choosing a fresh seed after seeing an outcome. Permissionless callers can still choose whether and when to open another round, and separate instances can be created.

## Methods

- approve() and withdraw() change the signing member's continuing consent while OPEN.
- seal() requires unanimous consent and fixes the future beacon round.
- draw() fetches that exact round and records the sampled minimum-repeat partition.
- state() exposes consent, current lock and pair counts.
- result(round_number) exposes every completed partition and its beacon provenance.

## Verification

~~~sh
pip install -r requirements-dev.txt
genvm-lint download --version v0.2.16
genvm-lint check contracts/pod_draw.py
python -m pytest tests/direct -q
npm ci
node --test tests/rpc-preflight.test.cjs tests/beacon.test.cjs
node scripts/verify-proofs.cjs
~~~

Direct tests exercise three rounds, source disagreement and malformed data, locked-target retry, consent, native Address calldata, and 400 optimizer cases checked against independently enumerated binary assignments. The live CLI suite uses seven encrypted disposable wallets and verifies 19 receipts across three future beacon draws. Its independent verifier checks every state transition, signed argument, complete candidate set, sampler index, pair-count update and BLS signature.

Generic CLI transport is reused under MIT. [drand HTTP API](https://docs.drand.love/developer/http-api/) · [drand protocol](https://docs.drand.love/docs/specification/) · [GenLayer transaction context](https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context).
