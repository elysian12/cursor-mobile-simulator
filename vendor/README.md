# vendor

Only [`IDB_PIN`](IDB_PIN) is committed.

`scripts/build-idb.sh` clones [facebook/idb](https://github.com/facebook/idb) at that SHA into `vendor/facebook-idb/` and builds FBControlCore + FBSimulatorControl. That clone and its `Build/` products are gitignored — they are large and rebuilt locally.

Do not vendor license-violating binaries or unpublished Apple frameworks. facebook/idb is MIT; see the root [NOTICE](../NOTICE).
