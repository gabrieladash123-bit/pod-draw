# StudioNet scenario proofs

Contract [0x2B53ca2D6b5AF1586b5a17CDFD7Cfc4bc69253B3](https://explorer-studio.genlayer.com/address/0x2B53ca2D6b5AF1586b5a17CDFD7Cfc4bc69253B3) on gasless GenLayer StudioNet, chain 61999.

[Tested source](https://github.com/gabrieladash123-bit/pod-draw/blob/8a23c4e248f318b5d3dacad74c12f9ffeecab3c6/contracts/pod_draw.py) · [Passing workflow](https://github.com/gabrieladash123-bit/pod-draw/actions/runs/44476622004) · [Verification report](verified.json).

Source SHA-256 318cdd104da92a7145622876f4981b447a9a45f0e893c691f69b50e6e226467e. Deployment payload and a fresh source RPC read matched these exact tested bytes.

| Scenario | Execution | Agree / disagree / idle | Explorer | Receipt |
| --- | --- | --- | --- | --- |
| Deploy a six-member roster | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x7a2fc49351f55c129d1e1b5faee6164723e2df8b6f8181e81e2f9f9d44031459) | [deploy](deploy-receipt.json) |
| Reject unregistered caller | ERROR | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x861748ad65c00c41fb6ecdfc38681c043e3f028714b99a2e7ab09dfc74848be8) | [blocked-outsider](blocked-outsider-receipt.json) |
| Member 1 approves | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x64d25ceaf3e616be71ab8edbf9da1ace78f5a3b805384046a1bea7fbb26bbb68) | [approve-0](approve-0-receipt.json) |
| Member 2 approves | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x72e97d4335ec49995fc7844eb0f992e7573a6b1e59779910fa6c494b7f91fbc6) | [approve-1](approve-1-receipt.json) |
| Member 3 approves | SUCCESS | 4 / 0 / 1 | [Transaction](https://explorer-studio.genlayer.com/tx/0x4ca7d9630e92b10e5d1ee6496c1803baf1b606eb499fce6d8e0b7dc76c91ef91) | [approve-2](approve-2-receipt.json) |
| Member 4 approves | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xfa31e4747c44899c2bda27ab9fe1720aa0d2f20ab2a3879bfc4e0e72a1ca91f2) | [approve-3](approve-3-receipt.json) |
| Member 5 approves | SUCCESS | 4 / 0 / 1 | [Transaction](https://explorer-studio.genlayer.com/tx/0xe5df8b7d85e10080cb67c3869abec03f381ed0fd69d4ddb20260023e5f84ce1a) | [approve-4](approve-4-receipt.json) |
| Member 6 approves | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xa98533cc683a357f6e32a4cd7baaa8d71bd8ffa15347dbc269e7c478ee3260ca) | [approve-5](approve-5-receipt.json) |
| Seal consent and future beacon 1 | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xbf77617026c79bf87b679e32578149c47da61bf723f5d43c36756ba2f9616844) | [seal-1](seal-1-receipt.json) |
| Reject withdrawal from sealed roster | ERROR | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x7968750a3fbab37133d8c308de58e42ca5ed56eaabc3e70412c32a738fc646db) | [blocked-withdraw](blocked-withdraw-receipt.json) |
| Draw first minimum-repeat partition | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xaa3f48130eaa8a696d9555709c0d278db17bd0baf7ffefdfde121663f0e51ca7) | [draw-1](draw-1-receipt.json) |
| Reject redraw without a new seal | ERROR | 4 / 0 / 1 | [Transaction](https://explorer-studio.genlayer.com/tx/0xa266028c5028eea2873efd313397425263fa49bb6fa0033295ffc899b24d2b7d) | [blocked-redraw](blocked-redraw-receipt.json) |
| Seal future beacon 2 | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x43581f177c85cff93c6012ba3509ba043ad467f21d649d119d4afa3f3c92bb43) | [seal-2](seal-2-receipt.json) |
| Draw with prior pairings counted | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xe314ae37962f52668fdc9a485bf279927bd4d927b4f4017cfadf7fa89de5378a) | [draw-2](draw-2-receipt.json) |
| Withdraw continuing consent while open | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x26c0dd7d6e96868a318ed48c359ee6d031eb6b1e3754e0271eb97c79e6d79592) | [withdraw-open](withdraw-open-receipt.json) |
| Reject sealing without unanimous consent | ERROR | 5 / 0 / 0 | [Transaction](https://explorer-studio.genlayer.com/tx/0x18bf07570b6c0e65b293612d483cc6e7393d58b729c70e84bc2acb116a3e27f0) | [blocked-seal](blocked-seal-receipt.json) |
| Renew withdrawn consent | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xb5f5cdf8d36b5456d6f12c9f9fd901b7e124964e7cbbf9d97223c68d13b38ca2) | [reapprove](reapprove-receipt.json) |
| Seal future beacon 3 | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x9d415f947cb8415dda9144347196cd4273d61cc829bbe3b25480ffdd6d9c4976) | [seal-3](seal-3-receipt.json) |
| Draw third partition with accumulated history | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x778313e9777c3a4d87223d3be633fb2d17b9090bdd096d26a96c9d850fd9596c) | [draw-3](draw-3-receipt.json) |

All 19 receipts finalized with MAJORITY_AGREE. Four expected failures preserved the previous state. The other 15 transactions succeeded. Every receipt was checked for actual signer, recipient and decoded calldata.

| Draw | drand round | Minimum repeat cost | Tied labeled partitions | Sample index | Alpha | Beta |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 34089658 | 0 | 8 | 0 | 0, 2, 4 | 1, 3, 5 |
| 2 | 34089727 | 2 | 6 | 4 | 1, 2, 5 | 0, 3, 4 |
| 3 | 34089831 | 4 | 4 | 3 | 0, 3, 5 | 1, 2, 4 |

Pod member numbers are zero-based roster indices. Each pod contains one member from each configured domain in this six-member case. The second draw has minimum repeat cost 2 because no two-pod repartition can avoid every previous co-pod pair. Each target was computed from the seal transaction time, at least 120 seconds ahead, and locked until resolved.

The archived FINALIZED seal receipt snapshots were read 79, 80, 79 seconds before the respective scheduled beacon times. The offline verifier checks these receipt timestamps, including agreement between the creation timestamp and the stored seal time.

The independent verifier enumerates every binary assignment, verifies the complete optimum set, reconstructs the domain-separated rejection sampler, checks all pair-count increments and replays consent and lock transitions. It also verifies the BLS signature on every recorded quicknet beacon against the pinned public key. All previous result records were re-read after every transaction.

The GenVM suite passed 17 direct tests, including 400 optimizer cases, native Address calldata, future gates and fixed-target failure/retry. The JavaScript suites passed 12 tests for transport and BLS verification.

~~~sh
npm ci
node scripts/verify-proofs.cjs
~~~

The contract authenticates source observations through GenLayer web consensus over api.drand.sh and api2.drand.sh. Its signature-to-randomness SHA-256 check establishes response consistency. Full BLS verification is performed by the proof tooling. Fault-domain labels are fixed, approved policy inputs. Accurate transaction times, prompt latest-round publication and seal finality before beacon publication are operating assumptions.

The proof uses seven encrypted disposable CLI wallets, with six in the roster. Each instance supports 4–8 members and 32 draws. Alpha and beta are distinct pod labels.

[Transaction journal](transactions.json) · [Submission text](../SUBMISSION.md).
