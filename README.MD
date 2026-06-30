# Bedrock data Generator

## Setup

- Clone this repository locally: `git clone https://github.com/mc-zuri/bedrock-data-generator`
- run `pnpm install`

## Running

Run the `pnpm run start` command. `./output/minecraft-data` will have generated data for all versions from /src/versions.ts

## Add new version

- Add new version data in src\versions.ts
- run `pnpm run capture-steve --version=[VERSIOn] --port=19150` and comect with minecraft client to started server
