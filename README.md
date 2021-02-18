![Logo](admin/sureflap.png)
# ioBroker.sureflap

[![NPM version](http://img.shields.io/npm/v/iobroker.sureflap.svg)](https://www.npmjs.com/package/iobroker.sureflap)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sureflap.svg)](https://www.npmjs.com/package/iobroker.sureflap)
![Number of Installations (latest)](http://iobroker.live/badges/sureflap-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/sureflap-stable.svg)
[![Dependency Status](https://img.shields.io/david/Sickboy78/iobroker.sureflap.svg)](https://david-dm.org/Sickboy78/iobroker.sureflap)
[![Known Vulnerabilities](https://snyk.io/test/github/Sickboy78/ioBroker.sureflap/badge.svg)](https://snyk.io/test/github/Sickboy78/ioBroker.sureflap)

[![NPM](https://nodei.co/npm/iobroker.sureflap.png?downloads=true)](https://nodei.co/npm/iobroker.sureflap/)

**Tests:** ![Test and Release](https://github.com/Sickboy78/ioBroker.sureflap/workflows/Test%20and%20Release/badge.svg) Linux/Mac/Windows: [![Travis-CI](http://img.shields.io/travis/Sickboy78/ioBroker.sureflap/master.svg)](https://travis-ci.com/Sickboy78/ioBroker.sureflap) Windows: [![AppVeyor](https://ci.appveyor.com/api/projects/status/github/Sickboy78/ioBroker.sureflap?branch=master&svg=true)](https://ci.appveyor.com/project/Sickboy78/ioBroker.sureflap/)

## sureflap adapter for ioBroker

Adpater für Sureflap Katzen- und Haustierklappen von Sure Petcare

## Struktur

Der Adapter erzeugt folgende hirarchische Strukur:

Adapter<br>
├ Haushalt<br>
│ ├ Hub<br>
│ │ ├ led_mode<br>
│ │ ├ online<br>
│ │ └ Klappe<br>
│ │ &nbsp;&nbsp;&nbsp; ├ battery<br>
│ │ &nbsp;&nbsp;&nbsp; ├ battery_percentage<br>
│ │ &nbsp;&nbsp;&nbsp; ├ online<br>
│ │ &nbsp;&nbsp;&nbsp; └ control<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ curfew<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ lockmode<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ curfew<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; │ └ Sperrzeit<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; │ &nbsp;&nbsp;&nbsp; ├ enabled<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; │ &nbsp;&nbsp;&nbsp; ├ lock_time<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; │ &nbsp;&nbsp;&nbsp; └unlock_time<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └ last_curfew<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └ Sperrzeit<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ enabled<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ lock_time<br>
│ │ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └ unlock_time<br>
│ └ pets<br>
│ &nbsp;&nbsp;&nbsp; └ Haustier<br>
│ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ name<br>
│ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├ inside<br>
│ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └ since<br>
└ info<br>
&nbsp;&nbsp;&nbsp; ├ all_devices_online<br>
&nbsp;&nbsp;&nbsp; └ connection<br>

## Folgende Werte können geschrieben werden

control.curfew - Ausgangssperre ein- (true) oder ausschalten (false)

control.lockmode - Sperrmodus setzen (0 - offen, 1 - Einsperren, 2 - Aussperren, 3 - Ein- und Aussperren)

Haustier.inside - Haustier auf drin (true) oder draußen (false) setzen
  

## Developer manual
This section is intended for the developer. It can be deleted later

### Getting started

You are almost done, only a few steps left:
1. Create a new repository on GitHub with the name `ioBroker.sureflap`
1. Initialize the current folder as a new git repository:  
	```bash
	git init
	git add .
	git commit -m "Initial commit"
	```
1. Link your local repository with the one on GitHub:  
	```bash
	git remote add origin https://github.com/Sickboy78/ioBroker.sureflap
	```

1. Push all files to the GitHub repo:  
	```bash
	git push origin master
	```

1. Head over to [main.js](main.js) and start programming!

### Best Practices
We've collected some [best practices](https://github.com/ioBroker/ioBroker.repositories#development-and-coding-best-practices) regarding ioBroker development and coding in general. If you're new to ioBroker or Node.js, you should
check them out. If you're already experienced, you should also take a look at them - you might learn something new :)

### Scripts in `package.json`
Several npm scripts are predefined for your convenience. You can run them using `npm run <scriptname>`
| Script name | Description |
|-------------|-------------|
| `test:js` | Executes the tests you defined in `*.test.js` files. |
| `test:package` | Ensures your `package.json` and `io-package.json` are valid. |
| `test:unit` | Tests the adapter startup with unit tests (fast, but might require module mocks to work). |
| `test:integration` | Tests the adapter startup with an actual instance of ioBroker. |
| `test` | Performs a minimal test run on package files and your tests. |
| `check` | Performs a type-check on your code (without compiling anything). |
| `lint` | Runs `ESLint` to check your code for formatting errors and potential bugs. |

### Writing tests
When done right, testing code is invaluable, because it gives you the 
confidence to change your code while knowing exactly if and when 
something breaks. A good read on the topic of test-driven development 
is https://hackernoon.com/introduction-to-test-driven-development-tdd-61a13bc92d92. 
Although writing tests before the code might seem strange at first, but it has very 
clear upsides.

The template provides you with basic tests for the adapter startup and package files.
It is recommended that you add your own tests into the mix.

### Publishing the adapter
Since you have chosen GitHub Actions as your CI service, you can 
enable automatic releases on npm whenever you push a new git tag that matches the form 
`v<major>.<minor>.<patch>`. The necessary steps are described in `.github/workflows/test-and-release.yml`.

To get your adapter released in ioBroker, please refer to the documentation 
of [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories#requirements-for-adapter-to-get-added-to-the-latest-repository).

### Test the adapter manually on a local ioBroker installation
In order to install the adapter locally without publishing, the following steps are recommended:
1. Create a tarball from your dev directory:  
	```bash
	npm pack
	```
1. Upload the resulting file to your ioBroker host
1. Install it locally (The paths are different on Windows):
	```bash
	cd /opt/iobroker
	npm i /path/to/tarball.tgz
	```

For later updates, the above procedure is not necessary. Just do the following:
1. Overwrite the changed files in the adapter directory (`/opt/iobroker/node_modules/iobroker.sureflap`)
1. Execute `iobroker upload sureflap` on the ioBroker host

## Changelog

### 1.0.0
* (Sickboy78) initial release

## License
MIT License

Copyright (c) 2021 Sickboy78 <asmoday_666@gmx.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
