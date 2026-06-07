# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # Unit tests + package validation
npm run test:js           # Unit tests only (Mocha)
npm run test:package      # Package metadata validation
npm run test:integration  # Integration tests
npm run lint              # ESLint
npm run check             # TypeScript type checking (no emit)
```

To run a single test file:
```bash
npx mocha --config test/mocharc.custom.json path/to/file.test.js
```

## Architecture

This is an **ioBroker adapter** that bridges the Sure Petcare® cloud API with the ioBroker home automation platform. It supports pet flaps, cat flaps, feeders, and water dispensers.

### Main Files

- **`main.js`** — The adapter class (~5800 lines). Handles the full lifecycle: authentication, periodic data fetching, creating the ioBroker object hierarchy, updating states, and handling user-initiated state changes.
- **`lib/surepet-api.js`** — REST API wrapper for the Sure Petcare cloud (HTTPS). Handles auth tokens, and queries for households, devices, pets, event history, and pet reports.

### Update Loop

The adapter polls the Sure Petcare cloud on a timer-based cycle:

```
startLoadingData → doAuthenticate → getHouseholds → startUpdateLoop
updateLoop → getDevices → getPets → getEventHistory → getPetReports
           → createAdapterObjectHierarchy → updateDevices → updatePets → updateEventHistory
```

Key intervals: data refresh every 10s, history/reports every 60s, login retry every 60s.

### State Change Flow

The adapter subscribes to `*.control.*` and `*.pets.*.inside` state changes in ioBroker. When a user changes a state, `onStateChange()` in `main.js` routes it to the appropriate control method, which calls the API and updates the device.

### ioBroker Object Hierarchy

The adapter creates a nested object tree in ioBroker:
```
HOUSEHOLD_NAME/
  HUB_NAME/
    control/led_mode
    DEVICE_NAME/
      control/lockmode, curfew_enabled, current_curfew, close_delay
      control/pets/PET_NAME/assigned, type
      status/, signal/, battery/
  pets/
    PET_NAME/inside, ...
```

### Device Types

5 supported device types identified by numeric IDs: HUB(1), PET_FLAP(3), FEEDER(4), CAT_FLAP(6), WATER_DISPENSER(8).

### Change Detection

The adapter keeps `devicesPrev`, `petsPrev`, `historyPrev`, `reportPrev` snapshots and only writes ioBroker states when data actually changes, minimizing unnecessary updates.

### Warning Suppression

Uses indexed warning arrays (20+ error codes) so repeated identical warnings don't spam the log. Each warning type tracks which device IDs have already been warned.

### Test Setup

Tests use **Mocha + Chai + Sinon + Proxyquire**. `@iobroker/adapter-core` and custom classes are stubbed via proxyquire. Test setup lives in `test/mocha.setup.js` (configures sinon-chai and chai-as-promised plugins).