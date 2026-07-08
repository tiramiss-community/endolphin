## test-federation

Test federation between two Misskey servers: `a.test` and `b.test`.

Run all federation tests from the repository root:

```sh
pnpm --filter backend test:fed
```

Run a specific test file by passing it after `--`:

```sh
pnpm --filter backend test:fed -- packages/backend/test-federation/test/user.test.ts
```

The runner handles certificate generation, config generation, Docker Compose startup, tester execution, logs on failure, compose shutdown, and DB/Redis bind volume cleanup.

By default, `test:fed` prints only the tester service logs on failure so that CI and local output stay readable. If you need full Docker Compose logs while debugging, run:

```sh
pnpm --filter backend test:fed:debug
```

If the project is already built and you want to skip the build step:

```sh
MISSKEY_TEST_FEDERATION_SKIP_BUILD=1 pnpm --filter backend test:fed
```

If a failure log is too noisy, suppress the two Misskey server logs and keep tester, proxy, database, Redis, setup, and daemon logs:

```sh
MISSKEY_TEST_FEDERATION_SUPPRESS_SERVER_LOGS=1 pnpm --filter backend test:fed
```

If you want to inspect only specific services, pass a comma-separated service list:

```sh
MISSKEY_TEST_FEDERATION_LOG_SERVICES=tester,daemon pnpm --filter backend test:fed
```

You can also pass the log selection directly to the runner. This is what the package scripts use internally:

```sh
tsx ./test-federation/run.ts --log-services=tester
tsx ./test-federation/run.ts --full-logs
tsx ./test-federation/run.ts --suppress-server-logs
```

The GitHub Actions workflow uses `test:fed` for normal runs. When you re-run a failed job with debug logging enabled, GitHub exposes `runner.debug=1`, so the workflow uses `test:fed:debug` and the runner prints logs for all services.

The runner needs Node.js, Docker Compose, and OpenSSL on the host. It does not require `bash` on the host. `setup.sh` is kept only as a compatibility wrapper for generating certificates and config files:

```sh
packages/backend/test-federation/setup.sh
```
