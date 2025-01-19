'use strict';

const https = require('https');

// Constants - timeout for https requests
const REQUEST_TIMEOUT = 120000;

class SurepetApi {
	/**
	 * @param {import('@iobroker/adapter-core').AdapterInstance} adapter ioBroker adapter instance
	 */
	constructor(adapter) {
		this.adapter = adapter;
	}

	/**
	 * does a login via the surepet API
	 *
	 * @return {Promise} Promise of an auth token
	 */
	doLoginAndGetAuthToken() {
		return this.doLoginAndGetAuthTokenForHostAndUsernameAndPassword(this.adapter.config.api_host, this.adapter.config.username, this.adapter.config.password);
	}

	/**
	 * does a login via the surepet API
	 *
	 * @param {string} host
	 * @param {string} username
	 * @param {string} password
	 * @return {Promise} Promise of an auth token
	 */
	doLoginAndGetAuthTokenForHostAndUsernameAndPassword(host, username, password) {
		return new Promise((resolve, reject) => {
			if (host === undefined || host === null || host === '') {
				return reject(new Error('No host provided.'));
			}
			if (username === undefined || username === null || username === '') {
				return reject(new Error('No username provided.'));
			}
			if (password === undefined || password === null || password === '') {
				return reject(new Error('No password provided.'));
			}

			const postData = JSON.stringify(this.buildLoginJsonData(username, password));
			const options = this.buildOptionsForHostAndPathAndMethod(host, '/api/auth/login', 'POST', '');
			this.adapter.log.debug(`login with json: ${this.replacePassword(postData)}`);
			this.httpsRequest(options, postData).then(result => {
				if (result === undefined || result.data === undefined || !('token' in result.data)) {
					return reject(new Error(`login failed. possible wrong login or pwd?`));
				} else {
					return resolve(result.data['token']);
				}
			}).catch(error => {
				return reject(error);
			});
		});
	}

	/********************************************
	 * methods to get data from surepetcare API *
	 ********************************************/

	/**
	 * get households
	 *
	 * @param {string} authToken
	 * @return {Promise} Promise of an array of households
	 */
	getHouseholds(authToken) {
		return /** @type {Promise<Array>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/household', 'GET', authToken);
			this.httpsRequest(options, '').then(result => {
				if (result === undefined || result.data === undefined || !Array.isArray(result.data) || result.data.size === 0) {
					return reject(new Error(`getting households failed.`));
				} else {
					return resolve(result.data);
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}

	/**
	 * get pets
	 *
	 * @param {string} authToken
	 * @return {Promise} Promise of an array of pets
	 */
	getPets(authToken) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/pet', 'GET', authToken);
			this.httpsRequest(options, '').then(result => {
				if (result === undefined || result.data === undefined) {
					return reject(new Error(`getting pets failed.`));
				} else {
					return resolve(result.data);
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}

	/**
	 * get devices for the given household
	 *
	 * @param {string} authToken
	 * @param {number} householdId
	 * @return {Promise} Promise of an array of devices
	 */
	getDevicesForHousehold(authToken, householdId) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/device?householdid=' + householdId, 'GET', authToken);
			this.httpsRequest(options, '').then(result => {
				if (result === undefined || result.data === undefined || !Array.isArray(result.data)) {
					return reject(new Error(`getting devices failed.`));
				} else {
					return resolve(result.data);
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}

	/**
	 * get history for the given household
	 *
	 * @param {string} authToken
	 * @param {number} householdId
	 * @return {Promise} Promise of an array of history events
	 */
	getHistoryForHousehold(authToken, householdId) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/timeline/household/' + householdId + '?page_size=25', 'GET', authToken);
			this.httpsRequest(options, '').then(result => {
				if (result === undefined || result.data === undefined) {
					return reject(new Error(`getting history failed.`));
				} else {
					return resolve(result.data);
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}


	/**
	 * get report data for the given pet
	 *
	 * @param {string} authToken
	 * @param {number} householdId
	 * @param {number} petId
	 * @return {Promise} Promise of an array of pet reports
	 */
	getReportForPet(authToken, householdId, petId) {
		return /** @type {Promise<Object>} */(new Promise((resolve, reject) => {
			const now = new Date();
			const from = this.getReportFromDate(now);
			const to = this.getReportToDate(now);
			const options = this.buildOptions('/api/v2/report/household/' + householdId + '/pet/' + petId + '/aggregate?from=' + from + '&to=' + to, 'GET', authToken);
			this.httpsRequest(options, '').then(result => {
				if (result === undefined || result.data === undefined) {
					return reject(new Error(`getting pet reports failed.`));
				} else {
					return resolve(result.data);
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}

	/******************************************
	 * methods to set data to surepetcare API *
	 ******************************************/

	/**
	 * set hub led mode
	 *
	 * @param {string} authToken
	 * @param {number} deviceId of hub
	 * @param {number} ledMode
	 * @return {Promise}
	 */
	setLedModeForHub(authToken, deviceId, ledMode) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const postData = JSON.stringify({'led_mode': ledMode});
			const options = this.buildOptions('/api/device/' + deviceId + '/control/async', 'PUT', authToken);
			this.httpsRequest(options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * set feeder close delay
	 *
	 * @param {string} authToken
	 * @param {number} deviceId of feeder
	 * @param {number} closeDelay
	 * @return {Promise}
	 */
	setCloseDelayForFeeder(authToken, deviceId, closeDelay) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const postData = JSON.stringify({'lid': {'close_delay': closeDelay}});
			const options = this.buildOptions('/api/device/' + deviceId + '/control/async', 'PUT', authToken);
			this.httpsRequest(options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * set flap pet type
	 *
	 * @param {string} authToken
	 * @param {number} deviceId
	 * @param {number} petTag
	 * @param {number} petType
	 * @return {Promise}
	 */
	setPetTypeForFlapAndPet(authToken, deviceId, petTag, petType) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const postData = JSON.stringify([{'tag_id': petTag, 'request_action': 0, 'profile': petType}]);
			const options = this.buildOptions('/api/v2/device/' + deviceId + '/tag/async', 'PUT', authToken);

			this.httpsRequest(options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * set flap lockmode
	 *
	 * @param {string} authToken
	 * @param {number} deviceId
	 * @param {number} lockMode
	 * @return {Promise}
	 */
	setLockModeForFlap(authToken, deviceId, lockMode) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const postData = JSON.stringify({'locking': lockMode});
			const options = this.buildOptions('/api/device/' + deviceId + '/control', 'PUT', authToken);

			this.httpsRequest(options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * set pet location
	 *
	 * @param {string} authToken
	 * @param {number} petId
	 * @param {number} value
	 * @return {Promise}
	 */
	setLocationForPet(authToken, petId, value) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const postData = JSON.stringify({
				'where': value,
				'since': this.getDateFormattedAsISOWithTimezone(new Date())
			});
			const options = this.buildOptions('/api/pet/' + petId + '/position', 'POST', authToken);

			this.httpsRequest(options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * set flap curfew
	 *
	 * @param {string} authToken
	 * @param {number} deviceId
	 * @param {object} curfew
	 * @return {Promise}
	 */
	setCurfewForFlap(authToken, deviceId, curfew) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const postData = JSON.stringify({curfew});
			const options = this.buildOptions('/api/device/' + deviceId + '/control/async', 'PUT', authToken);

			this.httpsRequest(options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**************************
	 * general https methods  *
	 **************************/

	/**
	 * builds a json options object for a https request
	 *
	 * @param {string} path
	 * @param {string} method
	 * @param {string} authToken
	 * @return {object}
	 */
	buildOptions(path, method, authToken) {
		return this.buildOptionsForHostAndPathAndMethod(this.adapter.config.api_host, path, method, authToken);
	}

	/**
	 * builds a json options object for a https request
	 *
	 * @param {string} host
	 * @param {string} path
	 * @param {string} method
	 * @param {string} authToken
	 * @return {object}
	 */
	buildOptionsForHostAndPathAndMethod(host, path, method, authToken) {
		const options = {
			hostname: host,
			port: 443,
			path: path,
			method: method,
			timeout: REQUEST_TIMEOUT,
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Cache-Control': 'no-cache',
				'Content-Type': 'application/json;charset=utf-8',
				'Host': host,
				'Origin': 'https://production.surehub.io',
				'Pragma': 'no-cache',
				'Referer': 'https://production.surehub.io/',
				'spc-client-type': 'react',
				'User-Agent': 'ioBroker/7.0'
			}
		};

		if (authToken !== undefined && authToken !== '') {
			options.headers['Authorization'] = 'Bearer ' + authToken;
		}

		return options;
	}

	/**
	 * builds a json login data object
	 *
	 * @param {string} username
	 * @param {string} password
	 * @return {object}
	 */
	buildLoginJsonData(username, password) {
		return {
			'email_address': username,
			'password': password,
			'device_id': '1050547954'
		};
	}

	/**
	 * does a https request
	 *
	 * @param {object} options
	 * @param {object} postData
	 * @return {Promise} Promise of an response JSon object
	 */
	httpsRequest(options, postData) {
		return new Promise((resolve, reject) => {
			const path = options.path.split('?')[0];
			this.adapter.log.silly(`doing https request to '${path}'`);
			const req = https.request(options, (res) => {
				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					this.adapter.log.debug(`Request (${path}) returned status code ${res.statusCode}.`);
					return reject(new Error(`Request returned status code ${res.statusCode}.`));
				} else {
					const data = [];
					res.on('data', (chunk) => {
						data.push(chunk);
					});
					res.on('end', () => {
						try {
							const obj = JSON.parse(data.join(''));
							return resolve(obj);
						} catch (err) {
							if (err instanceof Error) {
								this.adapter.log.debug(`JSon parse error in data: '${data}'`);
							}
							this.adapter.log.debug(`Response (${path}) error.`);
							return reject(new Error(`Response error: '${err}'.`));
						}
					});
					res.on('error', (err) => {
						this.adapter.log.debug(`Response (${path}) error.`);
						return reject(new Error(`Response error: '${err}'.`));
					});
				}
			});

			req.on('error', (err) => {
				this.adapter.log.debug(`Request (${path}) error.`);
				return reject(new Error(`Request error: '${err}'.`));
			});

			req.on('timeout', () => {
				req.destroy();
				this.adapter.log.debug(`Request (${path}) timeout.`);
				return reject(new Error(`Request timeout.`));
			});

			req.write(postData);
			req.end();
		});
	}

	/***************************
	 * general helper methods  *
	 ***************************/

	/**
	 * replaces password from json data with ******
	 *
	 * @param {string} jsonString
	 * @return {string}
	 */
	replacePassword(jsonString) {
		const json = JSON.parse(jsonString);
		json.password = '******';
		return JSON.stringify(json);
	}

	/**
	 * returns a date 7 days back with time set to 00:00:00
	 *
	 * @param {Date} date
	 * @return {string} a date as ISO string
	 */
	getReportFromDate(date) {
		const from = new Date(date.toDateString());
		from.setDate(from.getDate() - 7);
		return from.toISOString()
	}

	/**
	 * returns a date with time set to 23:59:59
	 *
	 * @param {Date} date
	 * @return {string} a date as ISO string
	 */
	getReportToDate(date) {
		const to = new Date(date.toDateString());
		to.setHours(23, 59, 59, 999);
		return to.toISOString();
	}

	/**
	 * returns given date in ISO format with timezone
	 *
	 * @param {Date} date
	 * @return {string}
	 */
	getDateFormattedAsISOWithTimezone(date) {
		const tzo = -date.getTimezoneOffset();
		const dif = tzo >= 0 ? '+' : '-';

		return date.getFullYear() +
			'-' + this.padZero(date.getMonth() + 1) +
			'-' + this.padZero(date.getDate()) +
			'T' + this.padZero(date.getHours()) +
			':' + this.padZero(date.getMinutes()) +
			':' + this.padZero(date.getSeconds()) +
			dif + this.padZero(tzo / 60) +
			':' + this.padZero(tzo % 60);
	}

	/**
	 * adds a leading zero if number is < 10
	 *
	 * @param {number} num
	 * @return {string}
	 */
	padZero(num) {
		const norm = Math.floor(Math.abs(num));
		return (norm < 10 ? '0' : '') + norm;
	}
}

module.exports = SurepetApi;