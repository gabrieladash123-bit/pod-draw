# Builder → Intelligent Contracts

**Title**

PodDraw — Consensus future-beacon pod sortition

**Notes / Description**

PodDraw forms two balanced pods from a fixed, unanimously consenting roster of 4–8 wallets. It separates configured fault domains, finds every partition with minimum cumulative repeat-pair cost, then samples uniformly among tied optima using a locked future drand round. Leader and validators independently fetch two quicknet relays and check exact round, signature, randomness digest and agreement. Failed fetches retain the same target. Each draw appends the candidate set and beacon provenance, then updates pairing counts for later rounds. Nineteen StudioNet receipts cover three future draws, renewed consent, sealed-roster and redraw rejection, and unregistered callers. Tests check 400 optimizer cases against exhaustive binary assignments. Contract beacon authenticity relies on GenLayer consensus over HTTPS relays. Proof tooling additionally verifies BLS signatures and independently replays every state transition. Fault domains are participant-approved configuration.

**Evidence links**

- [Repository](https://github.com/gabrieladash123-bit/pod-draw)
- [GenLayer contract source](https://github.com/gabrieladash123-bit/pod-draw/blob/8a23c4e248f318b5d3dacad74c12f9ffeecab3c6/contracts/pod_draw.py)
- [Contract explorer](https://explorer-studio.genlayer.com/address/0x2B53ca2D6b5AF1586b5a17CDFD7Cfc4bc69253B3)
- [Deployment transaction](https://explorer-studio.genlayer.com/tx/0x7a2fc49351f55c129d1e1b5faee6164723e2df8b6f8181e81e2f9f9d44031459)
- [Nineteen onchain receipts and three draw proofs](https://github.com/gabrieladash123-bit/pod-draw/blob/main/proofs/README.md)
- [Passing checks](https://github.com/gabrieladash123-bit/pod-draw/actions/runs/44476622004)
