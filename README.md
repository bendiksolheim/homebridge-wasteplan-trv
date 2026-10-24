# Homebridge Wasteplan TRV

Exposes the wasteplan for Trondheim (trv.no) to Apple Home via Homebridge, so
you get a notification on the morning waste is picked up.

Apple Home has no concept of waste pickup, and it can't send custom
notifications. This plugin creates one **contact sensor per waste fraction**
(Restavfall, Matavfall, Papp og papir, ...), and each sensor **opens** on
its pickup day between `openTime` and `closeTime`. Turn on notifications for
the sensors and Home tells you "Restavfall opened".

While a sensor is open, Home's status summary also shows it as open. That works
as a reminder for the rest of the day.

Requires Homebridge 2.x and Node.js 22, 24 or 26.

## Installation

Search for `homebridge-wasteplan-trv` in the Homebridge UI, or:

```sh
npm install -g homebridge-wasteplan-trv
```

## Configuration

Get your address UUID:

- Go to https://trv.no/plan/
- Enter your address, and go to the plan page
- Look at the URL, it should look something like https://trv.no/plan/ba3e0f81-d7b9-4131-a3f6-60cbbcd4b20e/
- Your UUID is the long number in the URL, like `ba3e0f81-d7b9-4131-a3f6-60cbbcd4b20e` in this case

Then configure the plugin in the Homebridge UI, or add a platform to `config.json`:

```json
{
  "platform": "WasteplanTRV",
  "name": "Wasteplan TRV",
  "addressId": "ba3e0f81-d7b9-4131-a3f6-60cbbcd4b20e",
  "openTime": "06:00",
  "closeTime": "23:59",
  "exclude": ["3000"]
}
```

| Option      | Default | Description                                                            |
| ----------- | ------- | ---------------------------------------------------------------------- |
| `addressId` |         | **Required.** The UUID from your plan URL.                             |
| `openTime`  | `06:00` | When sensors open on pickup day (HH:MM, Norwegian time).               |
| `closeTime` | `23:59` | When sensors close again on pickup day. Must be later than `openTime`. |
| `exclude`   | `[]`    | Fraction IDs that should not get a sensor. See the table below.        |

Times are always Norwegian time (Europe/Oslo), whatever time zone your server
runs in.

### Fractions

A sensor is created for every fraction that shows up in your plan. They are
named after the fraction, but you can rename them in the Home app.

| ID     | Fraction                   |
| ------ | -------------------------- |
| `9999` | Restavfall                 |
| `3000` | Matavfall                  |
| `2400` | Papp og papir              |
| `3200` | Plastemballasje            |
| `2612` | Glass- og metallemballasje |

## Getting notifications in Apple Home

Notifications for sensors are off by default. For each sensor:

1. Open the Home app and long-press the sensor, then tap the settings icon.
2. Under **Status and Notifications**, turn on **Activity Notifications**.
3. Optionally restrict when to notify, e.g. only during the day.

You'll then get a notification at `openTime` on pickup day.

## Technical details

The plan is fetched from TRV's API when Homebridge starts and once a week after
that:

```
GET https://trv.no/wp-json/wasteplan/v2/calendar/{address UUID}
```

The API returns about two months of pickups, including changes around
holidays. The last successful response is cached in Homebridge's storage
directory (`wasteplan-trv.json`), so sensors keep working if trv.no is down. A
failed fetch is retried every hour. The log shows an error if the cached plan
gets older than three weeks.

## Development

```sh
pnpm run install
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

Run a local Homebridge with the plugin:

```sh
pnpm build
npx homebridge -D -I -U ./.homebridge-dev -P .
```

`.homebridge-dev/config.json` needs a `bridge` section and the platform config
above.
