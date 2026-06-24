# Endolphin

[日本語](README.md)

Endolphin is a lightweight Misskey fork for individual use and small communities.

## What is Endolphin?

Endolphin takes its name from the former [Dolphin](https://github.com/misskey-dev/dolphin) project.
It aims for a balance that is not as minimal as Dolphin, yet not as feature-heavy as Misskey — just right for individuals and small communities.
Rather than public instances with thousands of users, it keeps the features needed for interaction among friends and hobby communities.

## Feature scope

Core functionality remains available, including timelines, notes, Drive, ActivityPub federation, lists, antennas, moderation, channels, and Deck.

Favorites, Pages, Gallery, achievements, Games, embeds, charts, chat, administrative database statistics, retention analytics, advertising, and promotions have been removed.
The [feature inventory](docs/endolphin/feature-inventory.md) records the complete classification and treatment of each API and UI surface.

To preserve API compatibility, endpoints for removed features remain registered. Read endpoints return an empty array, `null`, or a default value; write endpoints return `FEATURE_REMOVED` (HTTP 410 Gone).
Entities, database tables, migrations, and JSON schemas also remain, preserving compatibility with existing third-party applications and databases.

## Getting started

- Read the [fork policy](docs/endolphin/fork-policy.md) for Endolphin-specific policy and operational notes.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for development and contribution guidance.

## Development and upstream following

Endolphin continuously incorporates Misskey from misskey-dev/misskey.
Check the current following status with `node scripts/sync-upstream.mjs --check`; see the [upstream following workflow in the fork policy](docs/endolphin/fork-policy.md#upstream-追従フロー) for the complete process.

Endolphin-specific history is recorded in [CHANGELOG-endolphin.md](CHANGELOG-endolphin.md). See the upstream-owned `CHANGELOG.md` for changes inherited from misskey-dev/misskey.

## License and acknowledgements

Endolphin is available under [AGPL-3.0-only](LICENSE).
It is based on [Misskey](https://github.com/misskey-dev/misskey). We thank the Misskey project and all of its contributors.
