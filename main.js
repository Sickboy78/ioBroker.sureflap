/***********************
 *                     *
 *  Sure Flap Adapter  *
 *                     *
 ***********************/

'use strict';

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const https = require('https');
const util = require('util');

const ADAPTER_VERSION = '2.3.2';

const REQUEST_TIMEOUT = 120000;
// Constants - data update frequency
const RETRY_FREQUENCY_LOGIN = 60;
const UPDATE_FREQUENCY_DATA = 10;
const UPDATE_FREQUENCY_HISTORY = 60;
const UPDATE_FREQUENCY_REPORT = 60;
// Constants - device types
const DEVICE_TYPE_HUB = 1;
const DEVICE_TYPE_PET_FLAP = 3;
const DEVICE_TYPE_FEEDER = 4;
const DEVICE_TYPE_CAT_FLAP = 6;
const DEVICE_TYPE_WATER_DISPENSER = 8;
// Constants - feeder parameter
const FEEDER_SINGLE_BOWL = 1;
const FEEDER_FOOD_WET = 1;
const FEEDER_FOOD_DRY = 2;
// Constants - repeatable errors
const HUB_LED_MODE_MISSING = 101;
const DEVICE_BATTERY_DATA_MISSING = 201;
const DEVICE_BATTERY_PERCENTAGE_DATA_MISSING = 202;
const DEVICE_SERIAL_NUMBER_MISSING = 203;
const DEVICE_SIGNAL_STRENGTH_MISSING = 204;
const DEVICE_VERSION_NUMBER_MISSING = 205;
const DEVICE_ONLINE_STATUS_MISSING = 206;
const FLAP_LOCK_MODE_DATA_MISSING = 301;
const FLAP_CURFEW_DATA_MISSING = 302;
const FEEDER_CLOSE_DELAY_DATA_MISSING = 401;
const FEEDER_BOWL_CONFIG_DATA_MISSING = 402;
const FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING = 403;
const FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING = 404;
const FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING = 405;
const FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING = 406;
const CAT_FLAP_PET_TYPE_DATA_MISSING = 601;
const DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING = 801;
const DISPENSER_WATER_REMAINING_DATA_MISSING = 802;
const DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING = 803;
const PET_POSITION_DATA_MISSING = 901;
const PET_FEEDING_DATA_MISSING = 902;
const PET_DRINKING_DATA_MISSING = 903;
const PET_FLAP_STATUS_DATA_MISSING = 904;
const PET_OUTSIDE_DATA_MISSING = 905;
const PET_HOUSEHOLD_MISSING = 906;
const PET_NAME_MISSING = 907;

class Sureflap extends utils.Adapter {

	/**
	 * Constructor
	 *
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sureflap',
		});

		// class variables

		/* update loop status */
		// is first update loop
		this.firstLoop = true;
		// number of logins
		this.numberOfLogins = 0;
		// timer id
		this.timerId = 0;
		// adapter unloaded
		this.adapterUnloaded = false;

		/* connected devices */
		// flap connected to hub
		this.hasFlap = false;
		// feeder connected to hub
		this.hasFeeder = false;
		// water dispenser connected to hub
		this.hasDispenser = false;

		/* current and previous data from surepet API */
		// current state
		this.sureFlapState = {};
		// previous state
		this.sureFlapStatePrev = {};
		// history
		this.sureFlapHistory = [];
		// previous history
		this.sureFlapHistoryPrev = [];
		// aggregated report
		this.sureFlapReport = [];
		// previous aggregated report
		this.sureFlapReportPrev = [];
		// last history update timestamp
		this.lastHistoryUpdate = 0;
		// update history this loop
		this.updateHistory = true;
		// last aggregated report update timestamp
		this.lastReportUpdate = 0;
		// update aggregated report this loop
		this.updateReport = true;

		/* remember repeatable warnings to not spam iobroker log */
		// noinspection JSPrimitiveTypeWrapperUsage
		this.warnings = new Array();
		this.warnings[HUB_LED_MODE_MISSING] = [];
		this.warnings[DEVICE_BATTERY_DATA_MISSING] = [];
		this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING] = [];
		this.warnings[DEVICE_SERIAL_NUMBER_MISSING] = [];
		this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING] = [];
		this.warnings[DEVICE_VERSION_NUMBER_MISSING] = [];
		this.warnings[DEVICE_ONLINE_STATUS_MISSING] = [];
		this.warnings[FLAP_LOCK_MODE_DATA_MISSING] = [];
		this.warnings[FLAP_CURFEW_DATA_MISSING] = [];
		this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING] = [];
		this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING] = [];
		this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING] = [];
		this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING] = [];
		this.warnings[FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING] = [];
		this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING] = [];
		this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING] = [];
		this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING] = [];
		this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING] = [];
		this.warnings[CAT_FLAP_PET_TYPE_DATA_MISSING] = [];
		this.warnings[PET_POSITION_DATA_MISSING] = [];
		this.warnings[PET_FEEDING_DATA_MISSING] = [];
		this.warnings[PET_DRINKING_DATA_MISSING] = [];
		this.warnings[PET_FLAP_STATUS_DATA_MISSING] = [];
		this.warnings[PET_OUTSIDE_DATA_MISSING] = [];
		this.warnings[PET_HOUSEHOLD_MISSING] = [];
		this.warnings[PET_NAME_MISSING] = [];
		this.lastError = null;
		this.lastLoginError = null;

		// promisify setObjectNotExists
		this.setObjectNotExistsPromise = util.promisify(this.setObjectNotExists);

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setConnectionStatusToAdapter(false);

		// check adapter config for invalid values
		this.checkAdapterConfig();

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates("lights.*");
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates("*");
		this.subscribeStates('*.control.*');
		this.subscribeStates('*.pets.*.inside');

		// start loading the data from the surepetcare API
		this.startLoadingData();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.adapterUnloaded = true;
			clearTimeout(this.timerId);
			this.setConnectionStatusToAdapter(false);
			this.log.info(`everything cleaned up`);
		} catch (e) {
			this.log.warn(`adapter clean up failed: ${e}`);
		} finally {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 *
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		// desired value is set
		if (id && state && state.ack === false) {
			const l = id.split('.');
			if (this.isDeviceControl(l)) {
				if (this.isFlapControl(l)) {
					// change in control section of sureflap
					const hierarchy = l.slice(2, l.length - 2).join('.');
					const device = l[4];
					const control = l[l.length - 1];

					if (control === 'curfew_enabled') {
						this.changeCurfewEnabled(hierarchy, device, state.val === true);
					} else if (control === 'lockmode' && typeof (state.val) === 'number') {
						this.changeLockmode(hierarchy, device, state.val);
					} else if (control === 'current_curfew' && typeof (state.val) === 'string') {
						this.changeCurrentCurfew(hierarchy, device, state.val);
					} else if (control === 'type' && typeof (state.val) === 'number') {
						const tag_id = this.getPetTagId(l[l.length - 3]);
						this.changePetType(hierarchy, device, tag_id, state.val);
					}
				} else if (this.isFeederControl(l)) {
					// change in control section of feeder
					const hierarchy = l.slice(2, l.length - 2).join('.');
					const device = l[4];
					const control = l[l.length - 1];

					if (control === 'close_delay' && typeof (state.val) === 'number') {
						this.changeCloseDelay(hierarchy, device, state.val);
					}
				} else if (this.isHubControl(l)) {
					// change hub led mode
					const hierarchy = l.slice(2, l.length - 3).join('.');
					const hub = l[l.length - 3];
					this.changeHubLedMode(hierarchy, hub, Number(state.val));
				} else {
					this.log.warn(`not allowed to change object ${id}`);
				}
			} else if (this.isPetLocation(l)) {
				// change of pet location
				const hierarchy = l.slice(2, l.length - 3).join('.');
				const pet = l[l.length - 2];
				this.changePetLocation(hierarchy, pet, state.val === true);
			} else {
				this.log.warn(`not allowed to change object ${id}`);
			}
		}
	}

	/*************************************************
	 * methods to start and keep update loop running *
	 *************************************************/

	/**
	 * starts loading data from the surepet API
	 */
	startLoadingData() {
		this.log.debug(`starting SureFlap Adapter v` + ADAPTER_VERSION);
		clearTimeout(this.timerId);
		this.doAuthenticate()
			.then(() => this.startUpdateLoop())
			.catch(error => {
				if (error.message === this.lastLoginError) {
					this.log.debug(error);
				} else {
					this.log.error(error);
					this.lastLoginError = error.message;
				}
				this.log.info(`disconnected`);
				if (!this.adapterUnloaded) {
					// @ts-ignore
					this.timerId = setTimeout(this.startLoadingData.bind(this), RETRY_FREQUENCY_LOGIN * 1000);
				}
			});
	}

	/**
	 * does the authentication with the surepetcare API
	 *
	 * @return {Promise}
	 */
	doAuthenticate() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.setConnectionStatusToAdapter(false);
			this.doLoginViaApi().then(token => {
				this.sureFlapState['token'] = token;
				this.setConnectionStatusToAdapter(true);
				this.log.info(`connected`);
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * starts the update loop
	 *
	 * @return {Promise}
	 */
	startUpdateLoop() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.lastLoginError = null;
			this.log.info(`starting update loop...`);
			this.firstLoop = true;
			this.updateLoop();
			this.log.info(`update loop started`);
			return resolve();
		}));
	}

	/**
	 * the update loop, refreshing the data every UPDATE_FREQUENCY_DATA seconds
	 */
	updateLoop() {
		clearTimeout(this.timerId);
		this.getDataFromApi()
			.then(() => this.getPetsDataFromApi())
			.then(() => this.getAdditionalDataFromApi())
			.then(() => this.createAdapterObjectHierarchy())
			.then(() => this.getDeviceStatusFromData())
			.then(() => this.getPetStatusFromData())
			.then(() => this.getEventHistoryFromData())
			.then(() => this.updateAdapterVersion())
			.then(() => this.setUpdateTimer())
			.catch(error => {
				if (error === undefined || error.message === undefined || error.message === this.lastError) {
					this.log.debug(error);
				} else {
					this.log.error(error);
					this.lastError = error.message;
				}
				this.log.info(`update loop stopped`);
				this.log.info(`disconnected`);
				if (!this.adapterUnloaded) {
					// @ts-ignore
					this.timerId = setTimeout(this.startLoadingData.bind(this), RETRY_FREQUENCY_LOGIN * 1000);
				}
			})
			.finally(() => {
				this.firstLoop = false;
			});
	}

	/**
	 * sets the update timer
	 *
	 * @return {Promise}
	 */
	setUpdateTimer() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if (!this.adapterUnloaded) {
				// @ts-ignore
				this.timerId = setTimeout(this.updateLoop.bind(this), UPDATE_FREQUENCY_DATA * 1000);
				return resolve();
			} else {
				return reject(new Error(`cannot set timer. Adapter already unloaded.`));
			}
		}));
	}

	/***********************************************
	 * methods to communicate with surepetcare API *
	 ***********************************************/

	/**
	 * does a login via the surepet API
	 *
	 * @return {Promise} Promise of an auth token
	 */
	doLoginViaApi() {
		return new Promise((resolve, reject) => {
			const postData = JSON.stringify(this.buildLoginJsonData());
			const options = this.buildOptions('/api/auth/login', 'POST', '');
			this.sureFlapState = {};
			this.numberOfLogins++;
			this.log.info(`connecting...`);
			this.log.debug(`json: ${this.replacePassword(postData)}`);
			this.log.debug(`login count: ${this.numberOfLogins}`);
			this.httpRequest('login', options, postData).then(result => {
				if (result === undefined || result.data === undefined || !('token' in result.data)) {
					return reject(new Error(`login failed. possible wrong login or pwd? retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
				} else {
					this.numberOfLogins = 0;
					return resolve(result.data['token']);
				}
			}).catch(error => {
				return reject(error);
			});
		});
	}

	/**
	 * gets the data for devices from surepet API
	 *
	 * @return {Promise}
	 */
	getDataFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/me/start', 'GET', this.sureFlapState['token'], true);
			this.httpRequest('get_data', options, '').then(result => {
				if (result === undefined || result.data === undefined) {
					return reject(new Error(`getting data failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
				} else {
					this.sureFlapStatePrev = JSON.parse(JSON.stringify(this.sureFlapState));
					this.sureFlapState.devices = result.data.devices;
					this.sureFlapState.households = result.data.households;
					this.sureFlapState.pets = result.data.pets;
					this.makeNamesCanonical();
					this.normalizeCurfew();
					this.normalizeLockMode();
					this.smoothBatteryOutliers();
					this.setOfflineDevices();
					this.calculateBatteryPercentageForDevices();
					this.setConnectedDevices();
					this.setLastUpdateToAdapter();
					return resolve();
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}

	/**
	 * gets the data for pets from surepet API
	 *
	 * @return {Promise}
	 */
	getPetsDataFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if (this.sureFlapState.pets && Array.isArray(this.sureFlapState.pets) && this.sureFlapState.pets.length > 0) {

				// Quick Fix to get pet status again
				let queryString = '?';
				for (let p = 0; p < this.sureFlapState.pets.length; p++) {
					queryString += 'Pet_Id=' + this.sureFlapState.pets[p].id + '&';
				}
				const from = new Date(new Date().toDateString());
				queryString += 'From=' + from.toISOString() + '&dayshistory=7';
				const options = this.buildOptions('/api/dashboard/pet' + queryString, 'GET', this.sureFlapState['token'], true);
				this.httpRequest('get_pets', options, '').then(result => {
					if (result === undefined || result.data === undefined) {
						return reject(new Error(`getting pets failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
					} else {
						if (result.data && Array.isArray(result.data) && result.data.length > 0) {
							for (let i = 0; i < result.data.length; i++) {
								for (let p = 0; p < this.sureFlapState.pets.length; p++) {
									if (this.objectContainsPath(result.data[i], 'pet_id') && result.data[i].pet_id === this.sureFlapState.pets[p].id) {
										if (!this.objectContainsPath(this.sureFlapState.pets[p], 'position')) {
											this.sureFlapState.pets[p].position = {};
											if (this.objectContainsPath(result.data[i], 'movement.where')) {
												this.sureFlapState.pets[p].position.where = result.data[i].movement.where;
											}
											if (this.objectContainsPath(result.data[i], 'movement.since')) {
												this.sureFlapState.pets[p].position.since = result.data[i].movement.since;
											}
										}
									}
								}
							}
						}
						return resolve();
					}
				}).catch(error => {
					return reject(error);
				});
			} else {
				return resolve();
			}
		}));
	}

	/**
	 * gets additional data for history and reports from surepet API
	 *
	 * @return {Promise}
	 */
	getAdditionalDataFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			let skipAggregatedReport = false;

			this.updateHistory = false;
			this.updateReport = false;

			// get history every UPDATE_FREQUENCY_HISTORY
			if (this.lastHistoryUpdate + UPDATE_FREQUENCY_HISTORY * 1000 < Date.now()) {
				skipAggregatedReport = true;
				promiseArray.push(this.getEventHistoryFromApi());
			}
			// get aggregated report every UPDATE_FREQUENCY_REPORT but not same time as history (don't spam surepet server) except for first loop
			if ((!skipAggregatedReport || this.firstLoop) && (this.hasFeeder || this.hasDispenser || this.hasFlap) && this.lastReportUpdate + UPDATE_FREQUENCY_REPORT * 1000 < Date.now()) {
				promiseArray.push(this.getAggregatedReportFromApi());
			}
			if (promiseArray.length === 0) {
				return resolve();
			} else {
				Promise.all(promiseArray).then(() => {
					return resolve();
				}).catch(err => {
					return reject(err);
				});
			}
		}));
	}

	/**
	 * gets the event history from surepet API
	 *
	 * @return {Promise}
	 */
	getEventHistoryFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			for (let h = 0; h < this.sureFlapState.households.length; h++) {
				promiseArray.push(this.getEventHistoryForHouseholdFromApi(this.sureFlapState.households[h].id));
			}
			Promise.all(promiseArray).then((values) => {
				for (let h = 0; h < this.sureFlapState.households.length; h++) {
					if (values[h] === undefined) {
						return reject(new Error(`getting history failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
					} else {
						if (this.sureFlapHistory[h] !== undefined) {
							this.sureFlapHistoryPrev[h] = JSON.parse(JSON.stringify(this.sureFlapHistory[h]));
						}
						this.sureFlapHistory[h] = values[h];
					}
				}
				this.lastHistoryUpdate = Date.now();
				this.updateHistory = true;
				return resolve();
			}).catch(err => {
				this.updateHistory = false;
				return reject(err);
			});
		}));
	}

	/**
	 * gets the event history from surepet API for the household with id
	 *
	 * @param {Number} id
	 * @return {Promise} of a JSon object
	 */
	getEventHistoryForHouseholdFromApi(id) {
		return (new Promise((resolve, reject) => {
			//const promiseArray = [];
			let options = this.buildOptions('/api/timeline/household/' + id, 'GET', this.sureFlapState['token']);
			this.httpRequest('get_history', options, '').then(result => {
				if (result === undefined || result.data === undefined) {
					return reject(new Error(`getting history failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
				} else {
					if (result.data.length === 0 || result.data[0].id === undefined) {
						return resolve(result.data);
					} else {
						options = this.buildOptions('/api/timeline/household/' + id + '?since_id=' + result.data[0].id + '&page_size=25', 'GET', this.sureFlapState['token']);
						this.httpRequest('get_history_since', options, '').then(sinceResult => {
							if (sinceResult === undefined) {
								return resolve(result.data);
							} else {
								if (sinceResult.data === undefined || sinceResult.data.length === 0) {
									return resolve(result.data);
								} else {
									const data = [...sinceResult.data, ...result.data];
									return resolve(data.length > 25 ? data.slice(0, 25) : data);
								}
							}
						}).catch(() => {
							return resolve(result.data);
						});
					}
				}
			}).catch(err => {
				return reject(err);
			});
		}));
	}

	/**
	 * gets the aggregated report from surepet API
	 *
	 * @return {Promise}
	 */
	getAggregatedReportFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			for (let p = 0; p < this.sureFlapState.pets.length; p++) {
				promiseArray.push(this.getReportForHouseholdAndPetFromApi(this.sureFlapState.pets[p].household_id, this.sureFlapState.pets[p].id));
			}
			Promise.all(promiseArray).then((values) => {
				for (let p = 0; p < this.sureFlapState.pets.length; p++) {
					if (values[p] === undefined) {
						return reject(new Error(`getting report data for pet '${this.sureFlapState.pets[p].name}' failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
					} else {
						if (this.sureFlapReport[p] !== undefined) {
							this.sureFlapReportPrev[p] = JSON.parse(JSON.stringify(this.sureFlapReport[p]));
						}
						this.sureFlapReport[p] = values[p];
					}
				}
				this.lastReportUpdate = Date.now();
				this.updateReport = true;
				return resolve();
			}).catch(err => {
				this.updateReport = false;
				return reject(err);
			});
		}));
	}

	/**
	 * gets the aggregated report from surepet API for the household with household_id and pet with pet_id
	 *
	 * @param {Number} household_id
	 * @param {Number} pet_id
	 * @return {Promise} of a JSon object
	 */
	getReportForHouseholdAndPetFromApi(household_id, pet_id) {
		return (new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/report/household/' + household_id + '/pet/' + pet_id + '/aggregate', 'GET', this.sureFlapState['token']);
			this.httpRequest('get_report', options, '').then(result => {
				if (result === undefined || result.data === undefined) {
					return reject(new Error(`getting report for household '${household_id}' and pet '${pet_id}' failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
				} else {
					return resolve(result.data);
				}
			}).catch(err => {
				return reject(err);
			});
		}));
	}

	/*******************************************************************
	 * methods to get information from the response of the surepet API *
	 *******************************************************************/

	/**
	 * gets the status from surepet state object
	 *
	 * @return {Promise}
	 */
	getDeviceStatusFromData() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.setGlobalOnlineStatusToAdapter();

			for (let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				for (let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id === this.sureFlapState.households[h].id) {
						if (this.hasParentDevice(this.sureFlapState.devices[d])) {
							const hierarchy = '.' + this.getParentDeviceName(this.sureFlapState.devices[d]);

							if ([DEVICE_TYPE_PET_FLAP, DEVICE_TYPE_CAT_FLAP].includes(this.sureFlapState.devices[d].product_id)) {
								// Sureflap Connect
								this.setSureflapConnectToAdapter(prefix, hierarchy, d, this.sureFlapState.devices[d].product_id === DEVICE_TYPE_CAT_FLAP);
							} else if (this.sureFlapState.devices[d].product_id === DEVICE_TYPE_FEEDER) {
								// Feeder Connect
								this.setFeederConnectToAdapter(prefix, hierarchy, d);
							} else if (this.sureFlapState.devices[d].product_id === DEVICE_TYPE_WATER_DISPENSER) {
								// water dispenser
								this.setWaterDispenserConnectToAdapter(prefix, hierarchy, d);
							}
							this.setBatteryStatusToAdapter(prefix, hierarchy, d);
							this.setSerialNumberToAdapter(prefix, hierarchy, d);
							this.setSignalStrengthToAdapter(prefix, hierarchy, d);
						} else {
							this.setHubStatusToAdapter(prefix, d);
						}
						this.setVersionsToAdapter(prefix, d);
						this.setOnlineStatusToAdapter(prefix, d);
					}
				}
			}
			return resolve();
		}));
	}

	/**
	 * gets the pets from surepet state object
	 *
	 * @return {Promise}
	 */
	getPetStatusFromData() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const numPets = this.sureFlapState.pets.length;

			for (let p = 0; p < numPets; p++) {
				if (this.sureFlapState.pets[p].name !== undefined) {
					const pet_name = this.sureFlapState.pets[p].name;
					const household_name = this.getHouseholdNameForId(this.sureFlapState.pets[p].household_id);
					const household_index = this.getHouseholdIndexForId(this.sureFlapState.pets[p].household_id);
					if (household_name !== undefined && household_index !== -1) {
						const prefix = household_name + '.pets';
						if (this.hasFlap) {
							this.setPetNameAndPositionToAdapter(prefix, pet_name, p);
							// add time spent outside and number of entries
							if (this.updateReport) {
								this.setPetOutsideToAdapter(prefix + '.' + pet_name + '.movement', p);
							}
							// add last used flap and direction
							if (this.updateHistory) {
								this.setPetLastMovementToAdapter(prefix, p, pet_name, household_index);
							}
						} else {
							this.setPetNameToAdapter(prefix, pet_name, p);
						}
						if (this.hasFeeder && this.updateReport) {
							this.setPetFeedingToAdapter(prefix + '.' + pet_name + '.food', p);
						}
						if (this.hasDispenser && this.updateReport) {
							this.setPetDrinkingToAdapter(prefix + '.' + pet_name + '.water', p);
						}
					} else {
						if (!this.warnings[PET_HOUSEHOLD_MISSING][p]) {
							this.log.warn(`could not get household for pet (${pet_name})`);
							this.warnings[PET_HOUSEHOLD_MISSING][p] = true;
						}
					}
				} else {
					if (!this.warnings[PET_NAME_MISSING][p]) {
						this.log.warn(`no name found for pet with id '${this.sureFlapState.devices[p].id}.`);
						this.warnings[PET_NAME_MISSING][p] = true;
					}
				}
			}
			return resolve();
		}));
	}

	/**
	 * gets the history from surepet history object
	 *
	 * @return {Promise}
	 */
	getEventHistoryFromData() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			if (this.updateHistory) {
				if (this.config.history_enable) {
					for (let h = 0; h < this.sureFlapState.households.length; h++) {
						const prefix = this.sureFlapState.households[h].name;

						if (this.sureFlapHistoryPrev[h] === undefined || JSON.stringify(this.sureFlapHistory[h]) !== JSON.stringify(this.sureFlapHistoryPrev[h])) {
							this.log.debug(`updating event history for household '${prefix}'`);
							/* structure of history changes, so we need to delete and recreate history event structure on change */
							this.deleteEventHistoryForHousehold(h, false).then(() => {
								if (this.sureFlapHistory.length > h) {
									const history_entries = Math.min(this.sureFlapHistory[h].length, this.config.history_entries);
									this.log.debug(`updating event history with ${history_entries} events`);
									for (let i = 0; i < history_entries; i++) {
										this.setHistoryEventToAdapter(prefix, h, i);
									}
								}
							}).catch(err => {
								this.log.error(`updating event history failed (${err})`);
							});
						}
					}
				}
				if (this.config.history_json_enable) {
					for (let h = 0; h < this.sureFlapState.households.length; h++) {
						const prefix = this.sureFlapState.households[h].name;

						if (this.sureFlapHistoryPrev[h] === undefined || JSON.stringify(this.sureFlapHistory[h]) !== JSON.stringify(this.sureFlapHistoryPrev[h])) {
							this.log.debug(`updating json event history for household '${prefix}'`);
							/* structure of history changes, so we need to delete and recreate history event structure on change */
							if (this.sureFlapHistory.length > h) {
								const history_entries = Math.min(this.sureFlapHistory[h].length, this.config.history_json_entries);
								this.log.debug(`updating json event history with ${history_entries} events`);
								for (let i = 0; i < history_entries; i++) {
									this.setState(prefix + '.history.json.' + i, JSON.stringify(this.sureFlapHistory[h][i]), true);
								}
							}
						}
					}
				}
			}
			return resolve();
		}));
	}

	/********************************************
	 * methods to set values to the surepet API *
	 ********************************************/

	/**
	 * changes the lockmode
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} value
	 */
	changeCloseDelay(hierarchy, device, value) {
		if (value !== 0 && value !== 4 && value !== 20) {
			this.log.warn(`invalid value for close delay: '${value}'`);
			this.resetControlCloseDelayToAdapter(hierarchy, device);
			return;
		}

		this.log.debug(`changing close delay to '${value}' ...`);
		this.setCloseDelayToApi(device, value).then(() => {
			this.log.info(`close delay changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing close delay failed: ${err}`);
			this.resetControlCloseDelayToAdapter(hierarchy, device);
		});
	}

	/**
	 * changes the lockmode
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} value
	 */
	changeLockmode(hierarchy, device, value) {
		if (value < 0 || value > 3) {
			this.log.warn(`invalid value for lock mode: '${value}'`);
			this.resetControlLockmodeToAdapter(hierarchy, device);
			return;
		}

		this.log.debug(`changing lock mode to '${value}' ...`);
		this.setLockmodeToApi(device, value).then(() => {
			this.log.info(`lock mode changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing lock mode failed: ${err}`);
			this.resetControlLockmodeToAdapter(hierarchy, device);
		});
	}

	/**
	 * changes the pet type (indoor or outdoor)
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} tag
	 * @param {number} value
	 */
	changePetType(hierarchy, device, tag, value) {
		if (value < 2 || value > 3) {
			this.log.warn(`invalid value for pet type: '${value}'`);
			this.resetControlPetTypeToAdapter(hierarchy, device, tag);
			return;
		}

		this.log.debug(`changing pet type to '${value}' ...`);
		this.setPetTypeToApi(device, tag, value).then(() => {
			this.log.info(`pet type changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing pet type failed: ${err}`);
			this.resetControlPetTypeToAdapter(hierarchy, device, tag);
		});
	}

	/**
	 * switches the curfew on or off
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {boolean} value
	 */
	changeCurfewEnabled(hierarchy, device, value) {
		let current_state = false;
		const device_type = this.getDeviceTypeByDeviceName(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		const obj_name_current_curfew = hierarchy + '.control' + '.current_curfew';
		this.getCurfewFromAdapter(obj_name_current_curfew).then(curfew => {
			current_state = this.isCurfewEnabled(curfew);
		}).finally(() => {
			this.log.debug(`control curfew old state: ${current_state} new state: ${value}`);
			if (current_state !== value) {
				if (value === true) {
					// enable curfew
					const obj_name_last_curfew = hierarchy + '.last_enabled_curfew';
					this.getCurfewFromAdapter(obj_name_last_curfew).then(curfew => {
						if (curfew.length > 0) {
							if (DEVICE_TYPE_PET_FLAP === device_type) {
								// pet flap takes single object instead of array
								curfew = curfew[0];
								curfew.enabled = true;
							}
							const curfewJSON = JSON.stringify(curfew);
							this.log.debug(`setting curfew to: '${curfewJSON}' ...`);
							this.setCurfewToApi(device, curfew).then(() => {
								this.log.info(`curfew successfully enabled`);
							}).catch(err => {
								this.log.error(`could not enable curfew because: ${err}`);
								this.resetControlCurfewEnabledToAdapter(hierarchy, device);
							});
						} else {
							this.log.error(`could not enable curfew because: last_enabled_curfew does not contain a curfew`);
							this.resetControlCurfewEnabledToAdapter(hierarchy, device);
						}
					}).catch(err => {
						this.log.error(`could not enable curfew because: ${err}`);
						this.resetControlCurfewEnabledToAdapter(hierarchy, device);
					});
				} else {
					// disable curfew
					const obj_name = hierarchy + '.control' + '.current_curfew';
					this.getCurfewFromAdapter(obj_name).then(curfew => {
						for (let h = 0; h < curfew.length; h++) {
							curfew[h].enabled = false;
						}
						if (DEVICE_TYPE_PET_FLAP === device_type) {
							// pet flap takes single object instead of array
							curfew = curfew[0];
						}
						this.log.debug('setting curfew to: ' + JSON.stringify(curfew));
						this.setCurfewToApi(device, curfew).then(() => {
							this.log.info(`curfew successfully disabled`);
						}).catch(err => {
							this.log.error(`could not disable curfew because: ${err}`);
							this.resetControlCurfewEnabledToAdapter(hierarchy, device);
						});
					}).catch(err => {
						this.log.error(`could not disable curfew because: ${err}`);
						this.resetControlCurfewEnabledToAdapter(hierarchy, device);
					});
				}
			}
		});
	}

	/**
	 * changes the current curfew
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {string} value
	 */
	changeCurrentCurfew(hierarchy, device, value) {
		const device_type = this.getDeviceTypeByDeviceName(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		let curfew = this.validateAndGetCurfewFromJsonString(value, device_type);
		if (curfew === null) {
			this.log.error(`could not update curfew because of previous error`);
			this.resetControlCurrentCurfewToAdapter(hierarchy, device);
		} else {
			if (DEVICE_TYPE_PET_FLAP === device_type) {
				// pet flap takes single object instead of array
				curfew = curfew[0];
			}
			this.log.debug(`changing curfew to: '${JSON.stringify(curfew)}' ...`);
			this.setCurfewToApi(device, curfew).then(() => {
				this.log.info(`curfew successfully updated`);
			}).catch(err => {
				this.log.error(`could not update curfew because: ${err}`);
				this.resetControlCurrentCurfewToAdapter(hierarchy, device);
			});
		}
	}

	/**
	 * changes the pet location
	 *
	 * @param {string} hierarchy
	 * @param {string} pet
	 * @param {boolean} value
	 */
	changePetLocation(hierarchy, pet, value) {
		this.log.debug(`changing location of pet '${pet}' to '${value ? 'inside' : 'outside'}' ...`);
		this.getStateValueFromAdapter(hierarchy + '.pets.' + pet + '.name').then(name => {
			this.setPetLocationToApi(name, value).then(() => {
				this.log.info(`location for pet '${name}' successfully set to '${value ? 'inside' : 'outside'}'`);
			}).catch(error => {
				this.log.error(`could not set pet location because: ${error}`);
				this.resetPetInsideToAdapter(hierarchy, pet);
			});
		}).catch(error => {
			this.log.error(`could not set pet location because: ${error}`);
			this.resetPetInsideToAdapter(hierarchy, pet);
		});
	}

	/**
	 * changes the hub led mode
	 *
	 * @param {string} hierarchy
	 * @param {string} hub
	 * @param {number} value
	 */
	changeHubLedMode(hierarchy, hub, value) {
		if (value !== 0 && value !== 1 && value !== 4) {
			this.log.warn(`invalid value for led mode: '${value}'`);
			this.resetHubLedModeToAdapter(hierarchy, hub);
			return;
		}

		this.log.debug(`changing hub led mode to '${value}' ...`);
		this.setHubLedModeToApi(hub, value).then(() => {
			this.log.info(`hub led mode successfully set`);
		}).catch(error => {
			this.log.error(`could not set hub led mode because: ${error}`);
			this.resetHubLedModeToAdapter(hierarchy, hub);
		});
	}

	/**
	 * sets the close delay
	 *
	 * @param {string} device
	 * @param {number} close_delay
	 * @return {Promise}
	 */
	setCloseDelayToApi(device, close_delay) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device, [DEVICE_TYPE_FEEDER]);
			const postData = JSON.stringify({'lid': {'close_delay': close_delay}});
			const options = this.buildOptions('/api/device/' + device_id + '/control', 'PUT', this.sureFlapState['token']);

			this.httpRequest('set_close_delay', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets the pet type
	 *
	 * @param {string} device
	 * @param {number} tag
	 * @param {number} type
	 * @return {Promise}
	 */
	setPetTypeToApi(device, tag, type) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
			const postData = JSON.stringify({'profile': type});
			const options = this.buildOptions('/api/device/' + device_id + '/tag/' + tag, 'PUT', this.sureFlapState['token']);

			this.httpRequest('set_pet_type', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets the lockmode
	 *
	 * @param {string} device
	 * @param {number} lockmode
	 * @return {Promise}
	 */
	setLockmodeToApi(device, lockmode) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
			const postData = JSON.stringify({'locking': lockmode});
			const options = this.buildOptions('/api/device/' + device_id + '/control', 'PUT', this.sureFlapState['token']);

			this.httpRequest('set_lockmode', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets the curfew
	 *
	 * @param {string} device
	 * @param {object} curfew
	 * @return {Promise}
	 */
	setCurfewToApi(device, curfew) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
			const postData = JSON.stringify({curfew});
			const options = this.buildOptions('/api/device/' + device_id + '/control', 'PUT', this.sureFlapState['token']);

			this.httpRequest('set_curfew', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets the pet location
	 *
	 * @param {string} pet
	 * @param {boolean} value
	 * @return {Promise}
	 */
	setPetLocationToApi(pet, value) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const pet_id = this.getPetId(pet);
			if (pet_id !== undefined) {
				const postData = JSON.stringify({
					'where': (value ? '1' : '2'),
					'since': this.getCurrentDateFormattedForSurepetApi()
				});
				const options = this.buildOptions('/api/pet/' + pet_id + '/position', 'POST', this.sureFlapState['token']);

				this.httpRequest('set_pet_location', options, postData).then(() => {
					return resolve();
				}).catch(error => {
					return reject(error);
				});
			} else {
				return reject(`could not get pet id for pet '${pet}'.`);
			}
		}));
	}

	/**
	 * sets hub led mode
	 *
	 * @param {string} hub
	 * @param {number} value
	 * @return {Promise}
	 */
	setHubLedModeToApi(hub, value) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const hub_id = this.getDeviceId(hub, [DEVICE_TYPE_HUB]);
			const postData = JSON.stringify({'led_mode': value});
			const options = this.buildOptions('/api/device/' + hub_id + '/control', 'PUT', this.sureFlapState['token']);
			this.httpRequest('set_led_mode', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/****************************************
	 * methods to set values to the adapter *
	 ****************************************/

	/**
	 * updates the adapter version state on the first update loop
	 *
	 * @return {Promise}
	 */
	updateAdapterVersion() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if (!this.adapterUnloaded) {
				// update adapter version after fist loop, so we can react to old version
				if (this.firstLoop) {
					this.setVersionToAdapter(ADAPTER_VERSION);
				}
				return resolve();
			} else {
				return reject(new Error(`cannot set adapter version. Adapter already unloaded.`));
			}
		}));
	}

	/**
	 * sets the current adapter version to the adapter
	 *
	 * @param {string} version
	 */
	setVersionToAdapter(version) {
		/* objects created via io-package.json, no need to create them here */
		this.setState('info.version', version, true);
	}

	/**
	 * sets connection status to the adapter
	 *
	 * @param {boolean} connected
	 */
	setConnectionStatusToAdapter(connected) {
		/* objects created via io-package.json, no need to create them here	*/
		this.setState('info.connection', connected, true);
	}

	/**
	 * sets global online status to the adapter
	 */
	setGlobalOnlineStatusToAdapter() {
		// all devices online status
		if (this.sureFlapState.all_devices_online !== undefined) {
			if (!this.sureFlapStatePrev || (this.sureFlapState.all_devices_online !== this.sureFlapStatePrev.all_devices_online)) {
				const obj_name = 'info.all_devices_online';
				/* objects created via io-package.json, no need to create them here */
				this.setState(obj_name, this.sureFlapState.all_devices_online, true);
			}
		}
	}

	/**
	 * sets the last time data was received from surepet api
	 */
	setLastUpdateToAdapter() {
		/* object created via io-package.json, no need to create them here */
		this.setState('info.last_update', this.getCurrentDateFormattedAsISO(), true);
	}


	/**
	 * sets sureflap attributes to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 * @param {boolean} isCatFlap
	 */
	setSureflapConnectToAdapter(prefix, hierarchy, deviceIndex, isCatFlap) {
		// lock mode
		if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.locking.mode')) {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.locking.mode') || (this.sureFlapState.devices[deviceIndex].status.locking.mode !== this.sureFlapStatePrev.devices[deviceIndex].status.locking.mode)) {
				const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.lockmode';
				try {
					this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.locking.mode, true);
				} catch (error) {
					this.log.error(`could not set lock mode to adapter (${error})`);
				}
			}
			this.warnings[FLAP_LOCK_MODE_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FLAP_LOCK_MODE_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no lock mode data found for flap '${this.sureFlapState.devices[deviceIndex].name}'.`);
				this.warnings[FLAP_LOCK_MODE_DATA_MISSING][deviceIndex] = true;
			}
		}

		// curfew
		if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.curfew')) {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'control.curfew') || (JSON.stringify(this.sureFlapState.devices[deviceIndex].control.curfew) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].control.curfew))) {
				if (this.sureFlapStatePrev.devices && this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'control.curfew') && this.isCurfewEnabled(this.sureFlapStatePrev.devices[deviceIndex].control.curfew)) {
					const obj_name_last_enabled_curfew = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.last_enabled_curfew';
					this.setCurfewToAdapter(obj_name_last_enabled_curfew, this.sureFlapStatePrev.devices[deviceIndex].control.curfew);
				}

				const obj_name_current_curfew = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.current_curfew';
				this.setCurfewToAdapter(obj_name_current_curfew, this.sureFlapState.devices[deviceIndex].control.curfew);

				const obj_name_curfew_enabled = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.curfew_enabled';
				try {
					this.setState(obj_name_curfew_enabled, this.isCurfewEnabled(this.sureFlapState.devices[deviceIndex].control.curfew), true);
				} catch (error) {
					this.log.error(`could not set curfew to adapter (${error})`);
				}
				const obj_name_curfew_active = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.curfew_active';
				try {
					const new_val = this.isCurfewActive(this.sureFlapState.devices[deviceIndex].control.curfew);
					this.getStateValueFromAdapter(obj_name_curfew_active).then(old_val => {
						if (old_val !== new_val) {
							this.setState(obj_name_curfew_active, new_val, true);
							this.log.debug(`changing curfew_active from ${old_val} to ${new_val}`);
						}
					}).catch(() => {
						this.setState(obj_name_curfew_active, new_val, true);
						this.log.debug(`setting curfew_active to ${new_val}`);
					});
				} catch (error) {
					this.log.error(`could not set curfew_active to adapter (${error})`);
				}

			}
			this.warnings[FLAP_CURFEW_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FLAP_CURFEW_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no curfew data found for flap '${this.sureFlapState.devices[deviceIndex].name}'.`);
				this.warnings[FLAP_CURFEW_DATA_MISSING][deviceIndex] = true;
			}
		}

		// assigned pets type
		if (isCatFlap) {
			if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'tags') && Array.isArray(this.sureFlapState.devices[deviceIndex].tags)) {
				for (let t = 0; t < this.sureFlapState.devices[deviceIndex].tags.length; t++) {
					if (!this.sureFlapStatePrev.devices || !this.sureFlapStatePrev.devices[deviceIndex].tags[t] || !this.sureFlapStatePrev.devices[deviceIndex].tags[t].profile || (this.sureFlapState.devices[deviceIndex].tags[t].profile !== this.sureFlapStatePrev.devices[deviceIndex].tags[t].profile)) {
						const name = this.getPetNameForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
						if (name !== undefined) {
							const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.assigned_pets.' + name + '.control' + '.type';
							try {
								this.setState(obj_name, this.sureFlapState.devices[deviceIndex].tags[t].profile, true);
							} catch (error) {
								this.log.error(`could not set pet type to adapter (${error})`);
							}
						} else {
							this.log.warn(`could not find pet with pet tag id (${this.sureFlapState.devices[deviceIndex].tags[t].id})`);
							this.log.debug(`cat flap '${this.sureFlapState.devices[deviceIndex].name}' has ${this.sureFlapState.devices[deviceIndex].tags.length} pets assigned and household has ${this.sureFlapState.pets.length} pets assigned.`);
						}
					}
				}
				this.warnings[CAT_FLAP_PET_TYPE_DATA_MISSING][deviceIndex] = false;
			} else {
				if (!this.warnings[CAT_FLAP_PET_TYPE_DATA_MISSING][deviceIndex]) {
					this.log.warn(`no pet type data found for cat flap '${this.sureFlapState.devices[deviceIndex].name}'.`);
					this.warnings[CAT_FLAP_PET_TYPE_DATA_MISSING][deviceIndex] = true;
				}
			}
		}
	}

	/**
	 * sets feeder attributes to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setFeederConnectToAdapter(prefix, hierarchy, deviceIndex) {
		const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name;

		// close delay
		if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.lid.close_delay')) {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'control.lid.close_delay') || (this.sureFlapState.devices[deviceIndex].control.lid.close_delay !== this.sureFlapStatePrev.devices[deviceIndex].control.lid.close_delay)) {
				this.setState(obj_name + '.control' + '.close_delay', this.sureFlapState.devices[deviceIndex].control.lid.close_delay, true);
				this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex] = false;
			}
			this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no close delay setting found for '${this.sureFlapState.devices[deviceIndex].name}'.`);
				this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex] = true;
			}
		}

		// feeder config data from sureFlapState
		if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.bowls.settings') && Array.isArray(this.sureFlapState.devices[deviceIndex].control.bowls.settings)) {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'control.bowls.settings') || (JSON.stringify(this.sureFlapState.devices[deviceIndex].control.bowls.settings) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].control.bowls.settings))) {
				for (let b = 0; b < this.sureFlapState.devices[deviceIndex].control.bowls.settings.length; b++) {
					this.getObject(obj_name + '.bowls.' + b, (err, obj) => {
						if (!err && obj) {
							if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].control.bowls.settings[b], 'food_type')) {
								this.setState(obj_name + '.bowls.' + b + '.food_type', this.sureFlapState.devices[deviceIndex].control.bowls.settings[b].food_type, true);
							}
							if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].control.bowls.settings[b], 'target')) {
								this.setState(obj_name + '.bowls.' + b + '.target', this.sureFlapState.devices[deviceIndex].control.bowls.settings[b].target, true);
							}
							this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
						} else {
							if (!this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING][deviceIndex]) {
								this.log.warn(`got feeder config data for object '${obj_name + '.bowls.' + b}' but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
								this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
							}
						}
					});
				}
			}
			this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no feeder config data found for '${this.sureFlapState.devices[deviceIndex].name}'.`);
				this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING][deviceIndex] = true;
			}
		}

		// feeder remaining food data
		if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.bowl_status') && Array.isArray(this.sureFlapState.devices[deviceIndex].status.bowl_status)) {
			// get feeder remaining food data from new bowl_status
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.bowl_status') || (JSON.stringify(this.sureFlapState.devices[deviceIndex].status.bowl_status) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].status.bowl_status))) {
				this.log.silly(`Updating remaining food data from bowl_status.`);
				for (let b = 0; b < this.sureFlapState.devices[deviceIndex].status.bowl_status.length; b++) {
					this.getObject(obj_name + '.bowls.' + b, (err, obj) => {
						if (!err && obj) {
							if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[b], 'current_weight')) {
								this.setState(obj_name + '.bowls.' + b + '.weight', this.sureFlapState.devices[deviceIndex].status.bowl_status[b].current_weight, true);
							}
							if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[b], 'fill_percent')) {
								this.setState(obj_name + '.bowls.' + b + '.fill_percent', this.sureFlapState.devices[deviceIndex].status.bowl_status[b].fill_percent, true);
							}
							if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[b], 'last_filled_at')) {
								this.setState(obj_name + '.bowls.' + b + '.last_filled_at', this.sureFlapState.devices[deviceIndex].status.bowl_status[b].last_filled_at, true);
							}
							if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[b], 'last_zeroed_at')) {
								this.setState(obj_name + '.bowls.' + b + '.last_zeroed_at', this.sureFlapState.devices[deviceIndex].status.bowl_status[b].last_zeroed_at, true);
							}
							this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
						} else {
							if (!this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex]) {
								this.log.warn(`got feeder status data for object '${obj_name + '.bowls.' + b}' but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
								this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
							}
						}
					});

				}
			}
		} else {
			// get feeder remaining food data from sureFlapReport
			if (this.updateReport && (this.sureFlapReportPrev === undefined || this.sureFlapReportPrev.length === 0 || JSON.stringify(this.sureFlapReport) !== JSON.stringify(this.sureFlapReportPrev))) {
				const device_id = this.sureFlapState.devices[deviceIndex].id;
				let last_datapoint = undefined;
				// look in feeding data for every pet
				for (let p = 0; p < this.sureFlapState.pets.length; p++) {
					// look in feeding data points starting with latest (last)
					if (this.objectContainsPath(this.sureFlapReport[p], 'feeding.datapoints') && Array.isArray(this.sureFlapReport[p].feeding.datapoints)) {
						for (let i = this.sureFlapReport[p].feeding.datapoints.length - 1; i >= 0; i--) {
							// check if datapoint is for this feeder
							if (this.sureFlapReport[p].feeding.datapoints[i].device_id === device_id) {
								// check if datapoint is newer than saved datapoint
								if (last_datapoint === undefined || last_datapoint.to === undefined || new Date(last_datapoint.to) < new Date(this.sureFlapReport[p].feeding.datapoints[i].to)) {
									last_datapoint = this.sureFlapReport[p].feeding.datapoints[i];
									break;
								}
							}
						}
					}
				}
				// if datapoint with food data found for this device, write it to adapter
				if (last_datapoint !== undefined) {
					this.log.silly(`Updating remaining food data from sureFlapReport.`);
					for (let b = 0; b < last_datapoint.weights.length; b++) {
						this.getObject(obj_name + '.bowls.' + last_datapoint.weights[b].index, (err, obj) => {
							if (!err && obj) {
								this.getState(obj_name + '.bowls.' + last_datapoint.weights[b].index + '.weight', (err, obj) => {
									if (!err && obj) {
										if (obj.val !== last_datapoint.weights[b].weight) {
											this.log.debug(`updating remaining food for feeder '${this.sureFlapState.devices[deviceIndex].name}' bowl '${last_datapoint.weights[b].index}' with '${last_datapoint.weights[b].weight}'.`);
											this.setState(obj_name + '.bowls.' + last_datapoint.weights[b].index + '.weight', last_datapoint.weights[b].weight, true);
										}
										this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
									} else if (!err && obj == null) {
										this.log.debug(`setting remaining food for feeder '${this.sureFlapState.devices[deviceIndex].name}' bowl '${last_datapoint.weights[b].index}' with '${last_datapoint.weights[b].weight}'.`);
										this.setState(obj_name + '.bowls.' + last_datapoint.weights[b].index + '.weight', last_datapoint.weights[b].weight, true);
										this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
									} else {
										if (!this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex]) {
											this.log.warn(`got feeder remaining food data for object '${obj_name}.bowls.${last_datapoint.weights[b].index}.weight' (${b}) but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
											this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
										}
									}
								});
							} else {
								if (!this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex]) {
									this.log.warn(`got feeder remaining food data for object '${obj_name}.bowls.${last_datapoint.weights[b].index}' (${b}) but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
									this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
								}
							}
						});
					}
					this.warnings[FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING][deviceIndex] = false;
				} else {
					if (!this.warnings[FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING][deviceIndex]) {
						this.log.warn(`no remaining food data for feeder '${this.sureFlapState.devices[deviceIndex].name}' found`);
						this.warnings[FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING][deviceIndex] = true;
					}

				}
			}
		}
	}

	/**
	 * sets water dispenser attributes to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setWaterDispenserConnectToAdapter(prefix, hierarchy, deviceIndex) {
		const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name;

		// water dispenser remaining water data
		if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.bowl_status') && Array.isArray(this.sureFlapState.devices[deviceIndex].status.bowl_status)) {
			// get feeder remaining food data from new bowl_status
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.bowl_status') || (JSON.stringify(this.sureFlapState.devices[deviceIndex].status.bowl_status) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].status.bowl_status))) {
				this.log.silly(`Updating remaining water data from bowl_status.`);
				this.getObject(obj_name + '.water', (err, obj) => {
					if (!err && obj) {
						if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[0], 'current_weight')) {
							this.setState(obj_name + '.water' + '.weight', this.sureFlapState.devices[deviceIndex].status.bowl_status[0].current_weight, true);
						}
						if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[0], 'fill_percent')) {
							this.setState(obj_name + '.water' + '.fill_percent', this.sureFlapState.devices[deviceIndex].status.bowl_status[0].fill_percent, true);
						}
						if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex].status.bowl_status[0], 'last_filled_at')) {
							this.setState(obj_name + '.water' + '.last_filled_at', this.sureFlapState.devices[deviceIndex].status.bowl_status[0].last_filled_at, true);
						}
						this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
					} else {
						if (!this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex]) {
							this.log.warn(`got remaining water data for object '${obj_name}.water' but object does not exist. This can happen if you newly added a water dispenser. In this case restart the adapter. If you did not add a water dispenser or if a restart does not help, contact developer.`);
							this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
						}
					}
				});
			}
		} else {
			// water dispenser remaining water data from sureFlapReport
			if (this.updateReport && (this.sureFlapReportPrev === undefined || this.sureFlapReportPrev.length === 0 || JSON.stringify(this.sureFlapReport) !== JSON.stringify(this.sureFlapReportPrev))) {
				const device_id = this.sureFlapState.devices[deviceIndex].id;
				let last_datapoint = undefined;
				// look in drinking data for every pet
				for (let p = 0; p < this.sureFlapState.pets.length; p++) {
					// look in drinking data points starting with latest (last)
					if (this.objectContainsPath(this.sureFlapReport[p], 'drinking.datapoints') && Array.isArray(this.sureFlapReport[p].drinking.datapoints)) {
						for (let i = this.sureFlapReport[p].drinking.datapoints.length - 1; i >= 0; i--) {
							// check if datapoint is for this water dispenser
							if (this.sureFlapReport[p].drinking.datapoints[i].device_id === device_id) {
								// check if datapoint is newer than saved datapoint
								if (last_datapoint === undefined || last_datapoint.to === undefined || new Date(last_datapoint.to) < new Date(this.sureFlapReport[p].drinking.datapoints[i].to)) {
									last_datapoint = this.sureFlapReport[p].drinking.datapoints[i];
									break;
								}
							}
						}
					}
				}
				// if datapoint with drinking data found for this device, write it to adapter
				if (last_datapoint !== undefined && last_datapoint.weights !== undefined && Array.isArray(last_datapoint.weights) && last_datapoint.weights.length > 0) {
					this.log.silly(`Updating remaining water data from sureFlapReport.`);
					this.getObject(obj_name + '.water', (err, obj) => {
						if (!err && obj) {
							this.getState(obj_name + '.water.weight', (err, obj) => {
								if (!err && obj) {
									if (obj.val !== last_datapoint.weights[0].weight) {
										this.log.debug(`updating remaining water for water dispenser '${this.sureFlapState.devices[deviceIndex].name}' with '${last_datapoint.weights[0].weight}'.`);
										this.setState(obj_name + '.water.weight', last_datapoint.weights[0].weight, true);
									}
									this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
								} else if (!err && obj == null) {
									this.log.debug(`setting remaining water for water dispenser '${this.sureFlapState.devices[deviceIndex].name}' with '${last_datapoint.weights[0].weight}'.`);
									this.setState(obj_name + '.water.weight', last_datapoint.weights[0].weight, true);
									this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
								} else {
									if (!this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex]) {
										this.log.warn(`got remaining water data for object '${obj_name}.water' but object does not exist. This can happen if you newly added a water dispenser. In this case restart the adapter. If you did not add a water dispenser or if a restart does not help, contact developer.`);
										this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
									}
								}
							});
						} else {
							if (!this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex]) {
								this.log.warn(`got remaining water data for object '${obj_name}.water' but object does not exist. This can happen if you newly added a water dispenser. In this case restart the adapter. If you did not add a water dispenser or if a restart does not help, contact developer.`);
								this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
							}
						}
					});
					this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING][deviceIndex] = false;
				} else {
					if (!this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING][deviceIndex]) {
						this.log.warn(`no remaining water data for water dispenser '${this.sureFlapState.devices[deviceIndex].name}' found`);
						this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING][deviceIndex] = true;
					}
				}
			}
		}
	}

	/**
	 * sets curfew of flap to the adapter
	 *
	 * @param {string} obj_name
	 * @param {object} new_curfew
	 */
	setCurfewToAdapter(obj_name, new_curfew) {
		this.log.silly(`setting curfew '${JSON.stringify(new_curfew)}' to '${obj_name}'`);
		this.setState(obj_name, JSON.stringify(new_curfew), true);
	}

	/**
	 * sets battery status to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setBatteryStatusToAdapter(prefix, hierarchy, deviceIndex) {
		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.battery')) {
			if (!this.warnings[DEVICE_BATTERY_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no battery data found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_BATTERY_DATA_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.battery') || this.sureFlapState.devices[deviceIndex].status.battery !== this.sureFlapStatePrev.devices[deviceIndex].status.battery) {
				const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'battery';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.battery, true);
			}
			this.warnings[DEVICE_BATTERY_DATA_MISSING][deviceIndex] = false;
		}

		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.battery_percentage')) {
			if (!this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no battery percentage data found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.battery_percentage') || this.sureFlapState.devices[deviceIndex].status.battery_percentage !== this.sureFlapStatePrev.devices[deviceIndex].status.battery_percentage) {
				const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'battery_percentage';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.battery_percentage, true);
			}
			this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets the serial number to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setSerialNumberToAdapter(prefix, hierarchy, deviceIndex) {
		if (!this.sureFlapState.devices[deviceIndex].serial_number) {
			if (!this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no serial number found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.sureFlapStatePrev.devices[deviceIndex].serial_number || (this.sureFlapState.devices[deviceIndex].serial_number !== this.sureFlapStatePrev.devices[deviceIndex].serial_number)) {
				const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'serial_number';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].serial_number, true);
			}
			this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets the signal strength to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setSignalStrengthToAdapter(prefix, hierarchy, deviceIndex) {
		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.signal.device_rssi')) {
			if (!this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex]) {
				this.log.warn(`no device rssi found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.signal.device_rssi') || (this.sureFlapState.devices[deviceIndex].status.signal.device_rssi !== this.sureFlapStatePrev.devices[deviceIndex].status.signal.device_rssi)) {
				const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.signal' + '.device_rssi';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.signal.device_rssi, true);
			}
			this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = false;
		}

		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.signal.hub_rssi')) {
			if (!this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex]) {
				this.log.warn(`no hub rssi found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.signal.hub_rssi') || (this.sureFlapState.devices[deviceIndex].status.signal.hub_rssi !== this.sureFlapStatePrev.devices[deviceIndex].status.signal.hub_rssi)) {
				const obj_name = prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.signal' + '.hub_rssi';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.signal.hub_rssi, true);
			}
			this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets the hardware and software version to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setVersionsToAdapter(prefix, deviceIndex) {
		let hierarchy = prefix;
		if (this.hasParentDevice(this.sureFlapState.devices[deviceIndex])) {
			hierarchy = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[deviceIndex]);
		}

		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.version.device.hardware')) {
			if (!this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no hardware version found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.version.device.hardware') || (this.sureFlapState.devices[deviceIndex].status.version.device.hardware !== this.sureFlapStatePrev.devices[deviceIndex].status.version.device.hardware)) {
				const obj_name = hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.version' + '.hardware';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.version.device.hardware, true);
			}
			this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = false;
		}

		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.version.device.firmware')) {
			if (!this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no firmware version found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.version.device.firmware') || (this.sureFlapState.devices[deviceIndex].status.version.device.firmware !== this.sureFlapStatePrev.devices[deviceIndex].status.version.device.firmware)) {
				const obj_name = hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.version' + '.firmware';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.version.device.firmware, true);
			}
			this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets hub status to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setHubStatusToAdapter(prefix, deviceIndex) {
		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.led_mode')) {
			if (!this.warnings[HUB_LED_MODE_MISSING][deviceIndex]) {
				this.log.warn(`no led mode found for hub '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[HUB_LED_MODE_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.led_mode') || (this.sureFlapState.devices[deviceIndex].status.led_mode !== this.sureFlapStatePrev.devices[deviceIndex].status.led_mode)) {
				const obj_name = prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.control.' + 'led_mode';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.led_mode, true);
			}
			this.warnings[HUB_LED_MODE_MISSING][deviceIndex] = false;
		}

		if (!this.sureFlapState.devices[deviceIndex].serial_number) {
			if (!this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no serial number found for hub '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.sureFlapStatePrev.devices[deviceIndex].serial_number || (this.sureFlapState.devices[deviceIndex].serial_number !== this.sureFlapStatePrev.devices[deviceIndex].serial_number)) {
				const obj_name = prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.serial_number';
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].serial_number, true);
			}
			this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets online status of devices to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setOnlineStatusToAdapter(prefix, deviceIndex) {
		// online status
		if (!this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.online')) {
			if (!this.warnings[DEVICE_ONLINE_STATUS_MISSING][deviceIndex]) {
				this.log.warn(`no online status found for '${this.sureFlapState.devices[deviceIndex].name}.`);
				this.warnings[DEVICE_ONLINE_STATUS_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.devices || !this.objectContainsPath(this.sureFlapStatePrev.devices[deviceIndex], 'status.online') || this.sureFlapState.devices[deviceIndex].status.online !== this.sureFlapStatePrev.devices[deviceIndex].status.online) {
				let obj_name = prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'online';
				if (this.hasParentDevice(this.sureFlapState.devices[deviceIndex])) {
					obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[deviceIndex]) + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'online';
				}
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.online, true);
			}
			this.warnings[DEVICE_ONLINE_STATUS_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets pet status to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} name
	 * @param {number} petIndex
	 */
	setPetNameToAdapter(prefix, name, petIndex) {
		if (!this.sureFlapStatePrev.pets || !this.sureFlapStatePrev.pets[petIndex] || !this.sureFlapStatePrev.pets[petIndex].name || name !== this.sureFlapStatePrev.pets[petIndex].name) {
			const obj_name = prefix + '.' + name;
			this.setState(obj_name + '.name', name, true);
		}
	}

	/**
	 * sets pet status to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} name
	 * @param {number} petIndex
	 */
	setPetNameAndPositionToAdapter(prefix, name, petIndex) {
		this.setPetNameToAdapter(prefix, name, petIndex);

		if (!this.objectContainsPath(this.sureFlapState.pets[petIndex], 'position.where') || !this.objectContainsPath(this.sureFlapState.pets[petIndex], 'position.since')) {
			if (!this.warnings[PET_POSITION_DATA_MISSING][petIndex]) {
				this.log.debug(`no position object found for pet '${name}'`);
				this.warnings[PET_POSITION_DATA_MISSING][petIndex] = true;
			}
		} else {
			if (!this.sureFlapStatePrev.pets || !this.sureFlapStatePrev.pets[petIndex] || !this.objectContainsPath(this.sureFlapStatePrev.pets[petIndex], 'position.where') || !this.objectContainsPath(this.sureFlapStatePrev.pets[petIndex], 'position.since') || this.sureFlapState.pets[petIndex].position.where !== this.sureFlapStatePrev.pets[petIndex].position.where || this.sureFlapState.pets[petIndex].position.since !== this.sureFlapStatePrev.pets[petIndex].position.since) {
				const obj_name = prefix + '.' + name;
				this.setState(obj_name + '.inside', (this.sureFlapState.pets[petIndex].position.where === 1), true);
				this.setState(obj_name + '.since', this.sureFlapState.pets[petIndex].position.since, true);
			}
			this.warnings[PET_POSITION_DATA_MISSING][petIndex] = false;
		}
	}

	/**
	 * sets pet feeding to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} p
	 */
	setPetFeedingToAdapter(prefix, p) {
		if (this.objectContainsPath(this.sureFlapReport[p], 'feeding.datapoints') && Array.isArray(this.sureFlapReport[p].feeding.datapoints) && this.sureFlapReport[p].feeding.datapoints.length > 0) {
			if (!this.sureFlapReportPrev[p] || !this.sureFlapReportPrev[p].feeding || JSON.stringify(this.sureFlapReport[p].feeding) !== JSON.stringify(this.sureFlapReportPrev[p].feeding)) {
				const consumption_data = this.calculateFoodConsumption(p);
				this.log.debug(`updating food consumed for pet '${this.sureFlapState.pets[p].name}' with '${JSON.stringify(consumption_data)}'`);
				this.setState(prefix + '.last_time_eaten', consumption_data.last_time, true);
				this.setState(prefix + '.times_eaten', consumption_data.count, true);
				this.setState(prefix + '.time_spent', consumption_data.time_spent, true);
				this.setState(prefix + '.wet.weight', consumption_data.weight[FEEDER_FOOD_WET], true);
				this.setState(prefix + '.dry.weight', consumption_data.weight[FEEDER_FOOD_DRY], true);
			}
			this.warnings[PET_FEEDING_DATA_MISSING][p] = false;
		} else {
			if (!this.warnings[PET_FEEDING_DATA_MISSING][p]) {
				this.log.warn(`aggregated report for pet '${this.sureFlapState.pets[p].name}' does not contain feeding data`);
				this.warnings[PET_FEEDING_DATA_MISSING][p] = true;
			}
		}
	}

	/**
	 * sets pet drinking to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} p
	 */
	setPetDrinkingToAdapter(prefix, p) {
		if (this.objectContainsPath(this.sureFlapReport[p], 'drinking.datapoints') && Array.isArray(this.sureFlapReport[p].drinking.datapoints) && this.sureFlapReport[p].drinking.datapoints.length > 0) {
			if (!this.sureFlapReportPrev[p] || !this.sureFlapReportPrev[p].drinking || JSON.stringify(this.sureFlapReport[p].drinking) !== JSON.stringify(this.sureFlapReportPrev[p].drinking)) {
				const consumption_data = this.calculateWaterConsumption(p);
				this.log.debug(`updating water consumed for pet '${this.sureFlapState.pets[p].name}' with '${JSON.stringify(consumption_data)}'`);
				this.setState(prefix + '.last_time_drunk', consumption_data.last_time, true);
				this.setState(prefix + '.times_drunk', consumption_data.count, true);
				this.setState(prefix + '.time_spent', consumption_data.time_spent, true);
				this.setState(prefix + '.weight', consumption_data.weight, true);
			}
			this.warnings[PET_DRINKING_DATA_MISSING][p] = false;
		} else {
			if (!this.warnings[PET_DRINKING_DATA_MISSING][p]) {
				this.log.warn(`aggregated report for pet '${this.sureFlapState.pets[p].name}' does not contain drinking data`);
				this.warnings[PET_DRINKING_DATA_MISSING][p] = true;
			}
		}
	}

	/**
	 * sets pet outside to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} p
	 */
	setPetOutsideToAdapter(prefix, p) {
		if (this.objectContainsPath(this.sureFlapReport[p], 'movement.datapoints') && Array.isArray(this.sureFlapReport[p].movement.datapoints) && this.sureFlapReport[p].movement.datapoints.length > 0) {
			if (!this.sureFlapReportPrev[p] || !this.sureFlapReportPrev[p].movement || JSON.stringify(this.sureFlapReport[p].movement) !== JSON.stringify(this.sureFlapReportPrev[p].movement)) {
				const outside_data = this.calculateTimeOutside(p);
				this.log.debug(`updating time outside for pet '${this.sureFlapState.pets[p].name}' with '${JSON.stringify(outside_data)}'`);
				this.setState(prefix + '.times_outside', outside_data.count, true);
				this.setState(prefix + '.time_spent_outside', outside_data.time_spent_outside, true);
			}
			this.warnings[PET_OUTSIDE_DATA_MISSING][p] = false;
		} else {
			if (!this.warnings[PET_OUTSIDE_DATA_MISSING][p]) {
				this.log.warn(`aggregated report for pet '${this.sureFlapState.pets[p].name}' does not contain movement data`);
				this.warnings[PET_OUTSIDE_DATA_MISSING][p] = true;
			}
		}
	}

	/**
	 * sets pet last movement to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} pet_index
	 * @param {string} pet_name
	 * @param {number} h
	 */
	setPetLastMovementToAdapter(prefix, pet_index, pet_name, h) {
		if (this.sureFlapHistoryPrev[h] === undefined || JSON.stringify(this.sureFlapHistory[h]) !== JSON.stringify(this.sureFlapHistoryPrev[h])) {
			const movement = this.calculateLastMovement(pet_name, h);
			if (movement !== undefined && 'last_direction' in movement && 'last_flap' in movement && 'last_flap_id' in movement && 'last_time' in movement) {
				const hierarchy = '.' + pet_name + '.movement';
				this.log.debug(`updating last movement for pet '${pet_name}' with '${JSON.stringify(movement)}'`);
				this.setState(prefix + hierarchy + '.last_time', movement.last_time, true);
				this.setState(prefix + hierarchy + '.last_direction', movement.last_direction, true);
				this.setState(prefix + hierarchy + '.last_flap', movement.last_flap, true);
				this.setState(prefix + hierarchy + '.last_flap_id', movement.last_flap_id, true);
				this.warnings[PET_FLAP_STATUS_DATA_MISSING][pet_index] = false;
			} else {
				if (!this.warnings[PET_FLAP_STATUS_DATA_MISSING][pet_index]) {
					this.log.warn(`history does not contain flap movement for pet '${pet_name}'`);
					this.warnings[PET_FLAP_STATUS_DATA_MISSING][pet_index] = true;
				}
			}
		}
	}

	/**
	 * sets history event to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} household
	 * @param {number} index
	 */
	setHistoryEventToAdapter(prefix, household, index) {
		this.createAdapterStructureFromJson(prefix + '.history.' + index, this.sureFlapHistory[household][index], 'history event ' + index);
	}

	/**
	 * creates folders and states from a json object to the adapter
	 *
	 * @param {string} prefix
	 * @param {object} json
	 * @param {string} desc
	 */
	createAdapterStructureFromJson(prefix, json, desc) {
		if (Array.isArray(json)) {
			if (this.arrayContainsObjects(json)) {
				this.setObjectNotExists(prefix, this.buildFolderObject(desc), () => {
					for (let i = 0; i < json.length; i++) {
						this.createAdapterStructureFromJson(prefix + '.' + i, json[i], i.toString());
					}
				});
			} else {
				this.setObjectNotExists(prefix, this.buildStateObject(desc, desc.endsWith('_at') ? 'date' : 'indicator', 'string'), () => {
					this.createAdapterStructureFromJson(prefix, JSON.stringify(json), desc);
				});
			}
		} else if (typeof (json) === 'object') {
			this.setObjectNotExists(prefix, this.buildFolderObject(desc), () => {
				Object.entries(json).forEach(([key, value]) => {
					this.createAdapterStructureFromJson(prefix + '.' + key, value, key);
				});
			});
		} else {
			this.setObjectNotExists(prefix, this.buildStateObject(desc, desc.endsWith('_at') ? 'date' : 'indicator', typeof (json)), () => {
				this.setState(prefix, json, true);
			});
		}
	}

	/*******************************************************************
	 * methods to reset values to the adapter to their previous values *
	 *******************************************************************/

	/**
	 * resets the control close delay adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlCloseDelayToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device, [DEVICE_TYPE_FEEDER]);
		if (this.objectContainsPath(this.sureFlapState, 'devices') && Array.isArray(this.sureFlapState.devices) && this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.lid.close_delay')) {
			const value = this.sureFlapState.devices[deviceIndex].control.lid.close_delay;
			this.log.debug(`resetting control close delay for ${device} to: ${value}`);
			this.setState(hierarchy + '.control' + '.close_delay', value, true);
		} else {
			this.log.warn(`can not reset control close delay for device '${device}' because there is no previous value`);
		}
	}

	/**
	 * resets the control lockmode adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlLockmodeToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (this.objectContainsPath(this.sureFlapState, 'devices') && Array.isArray(this.sureFlapState.devices) && this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'status.locking.mode')) {
			const value = this.sureFlapState.devices[deviceIndex].status.locking.mode;
			this.log.debug(`resetting control lockmode for ${device} to: ${value}`);
			this.setState(hierarchy + '.control' + '.lockmode', value, true);
		} else {
			this.log.warn(`can not reset control lockmode for device '${device}' because there is no previous value`);
		}
	}

	/**
	 * resets the pet type adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} tag
	 */
	resetControlPetTypeToAdapter(hierarchy, device, tag) {
		const deviceIndex = this.getDeviceIndex(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		const tagIndex = this.getTagIndexForDeviceIndex(deviceIndex, tag);
		const name = this.getPetNameForTagId(tag) !== undefined ? this.getPetNameForTagId(tag) : 'undefined';
		if (tagIndex !== -1 && this.objectContainsPath(this.sureFlapState.devices[deviceIndex].tags[tagIndex], 'profile')) {
			const value = this.sureFlapState.devices[deviceIndex].tags[tagIndex].profile;
			this.log.debug(`resetting control pet type for ${device} and ${name} to: ${value}`);
			this.setState(hierarchy + '.control' + '.type', value, true);
		} else {
			this.log.warn(`can not reset pet type for device '${device}' and pet '${name}' because there is no previous value`);
		}
	}

	/**
	 * resets the control curfew_enabled adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlCurfewEnabledToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (this.objectContainsPath(this.sureFlapState, 'devices') && Array.isArray(this.sureFlapState.devices) && this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.curfew')) {
			const value = this.isCurfewEnabled(this.sureFlapState.devices[deviceIndex].control.curfew);
			this.log.debug(`resetting control curfew_enabled for ${device} to: ${value}`);
			this.setState(hierarchy + '.control' + '.curfew_enabled', value, true);
		} else {
			this.log.warn(`can not reset control curfew_enabled for device '${device}' because there is no previous value`);
		}
	}

	/**
	 * resets the control current_curfew adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlCurrentCurfewToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (this.objectContainsPath(this.sureFlapState, 'devices') && Array.isArray(this.sureFlapState.devices) && this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.curfew')) {
			const value = JSON.stringify(this.sureFlapState.devices[deviceIndex].control.curfew);
			this.log.debug(`resetting control current_curfew for ${device}`);
			this.setState(hierarchy + '.control' + '.current_curfew', value, true);
		} else {
			this.log.warn(`can not reset control current_curfew for device '${device}' because there is no previous value`);
		}
	}

	/**
	 * resets the pet inside adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} pet
	 */
	resetPetInsideToAdapter(hierarchy, pet) {
		const petIndex = this.getPetIndex(pet);
		if (this.objectContainsPath(this.sureFlapState, 'pets') && Array.isArray(this.sureFlapState.pets) && this.objectContainsPath(this.sureFlapState.pets[petIndex], 'position.where')) {
			const value = this.sureFlapState.pets[petIndex].position.where;
			this.log.debug(`resetting pet inside for ${pet} to: ${value}`);
			this.setState(hierarchy + '.pets.' + pet + '.inside', value, true);
		} else {
			this.log.warn(`can not reset pet inside for '${pet}' because there is no previous value`);
		}
	}

	/**
	 * resets the hub led mode value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} hub
	 */
	resetHubLedModeToAdapter(hierarchy, hub) {
		const hubIndex = this.getDeviceIndex(hub, [DEVICE_TYPE_HUB]);
		if (this.objectContainsPath(this.sureFlapState, 'devices') && Array.isArray(this.sureFlapState.devices) && this.objectContainsPath(this.sureFlapState.devices[hubIndex], 'status.led_mode')) {
			const value = this.sureFlapState.devices[hubIndex].status.led_mode;
			this.log.debug(`resetting hub led mode for ${hub} to: ${value}`);
			this.setState(hierarchy + '.' + hub + '.control.led_mode', value, true);
		} else {
			this.log.warn(`can not reset hub led mode for '${hub}' because there is no previous value`);
		}
	}

	/******************************************************
	 * methods to get objects and values from the adapter *
	 ******************************************************/

	/**
	 * reads curfew data from the adapter
	 *
	 * @param {string} obj_name
	 * @return {Promise} Promise of a curfew JSon object
	 */
	getCurfewFromAdapter(obj_name) {
		return new Promise((resolve, reject) => {
			this.getStateValueFromAdapter(obj_name).then(curfewJson => {
				if (curfewJson === undefined || curfewJson === null) {
					this.log.silly(`getting curfew state from '${obj_name}' failed because it was null or empty`);
					return reject('curfew state is empty');
				}
				try {
					return resolve(JSON.parse(curfewJson));
				} catch (err) {
					this.log.silly(`getting curfew state from '${obj_name}' failed because '${err}'`);
					return reject(err);
				}
			}).catch(err => {
				this.log.silly(`getting curfew state from '${obj_name}' failed because '${err}'`);
				return reject(err);
			});
		});
	}

	/**
	 * gets an object by pattern and type
	 *
	 * @param {string} pattern
	 * @param {object} type
	 * @param {boolean} recursive
	 * @return {Promise} Promise of objects
	 */
	getObjectsByPatternAndType(pattern, type, recursive) {
		return new Promise((resolve, reject) => {
			this.getForeignObjects(pattern, type, [], (err, obj) => {
				if (!err && obj) {
					if (recursive === false) {
						const level = pattern.split('.').length;
						const newObj = {};
						Object.keys(obj).forEach((key) => {
							if (obj[key]._id.split('.').length === level) {
								newObj[key] = obj[key];
							}
						});
						resolve(newObj);
					} else {
						resolve(obj);
					}
				} else {
					reject(err);
				}
			});
		});
	}


	/*********************************************
	 * methods to delete values from the adapter *
	 *********************************************/

	/**
	 * deletes an object from the adapter if it exists
	 *
	 * @param {string} obj_name
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObjectFormAdapterIfExists(obj_name, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting object '${obj_name}'`);
			this.getObject(obj_name, (err, obj) => {
				if (!err && obj) {
					this.log.silly(`found object '${obj_name}'. trying to delete ...`);
					this.delObject(obj._id, {'recursive': recursive}, (err) => {
						if (err) {
							this.log.error(`could not delete object '${obj_name}' (${err})`);
							return reject();
						} else {
							this.log.silly(`deleted object '${obj_name}'`);
							return resolve();
						}
					});
				} else {
					this.log.silly(`object '${obj_name}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes an obsolete object if it exists
	 *
	 * @param {string} obj_name the device name
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObsoleteObjectIfExists(obj_name, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting obsolete object '${obj_name}'`);
			this.getObject(obj_name, (err, obj) => {
				if (!err && obj) {
					this.log.debug(`obsolete object ${obj_name} found. trying to delete ...`);
					this.delObject(obj._id, {'recursive': recursive}, (err) => {
						if (err) {
							this.log.error(`can not delete obsolete object ${obj_name} because: ${err}`);
							return reject();
						} else {
							this.log.debug(`obsolete object '${obj_name}' deleted`);
							return resolve();
						}
					});
				} else {
					this.log.silly(`obsolete object '${obj_name}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes an obsolete object if it exists and has given type
	 *
	 * @param {string} obj_name the device name
	 * @param {string} type
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObsoleteObjectIfExistsAndHasType(obj_name, type, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting obsolete object '${obj_name}'`);
			this.getObject(obj_name, (err, obj) => {
				if (!err && obj) {
					if (obj.type === type) {
						this.log.debug(`obsolete object ${obj_name} found. trying to delete ...`);
						this.delObject(obj._id, {'recursive': recursive}, (err) => {
							if (err) {
								this.log.error(`can not delete obsolete object ${obj_name} because: ${err}`);
								return reject();
							} else {
								this.log.debug(`obsolete object '${obj_name}' deleted`);
								return resolve();
							}
						});
					} else {
						this.log.silly(`obsolete object '${obj_name}' found but was not of type '${type}'`);
						return resolve();
					}
				} else {
					this.log.silly(`obsolete object '${obj_name}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes an obsolete object if it exists and has the device_id in its name
	 *
	 * @param {string} obj_name the device name
	 * @param {string} device_id the device id
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObsoleteObjectWithDeviceIdIfExists(obj_name, device_id, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting obsolete object '${obj_name}'`);
			this.getObject(obj_name, (err, obj) => {
				if (!err && obj) {
					if (obj.common !== undefined && obj.common.name !== undefined && obj.common.name.toString().includes(device_id)) {
						this.log.debug(`obsolete object ${obj_name} found. trying to delete ...`);
						this.delObject(obj._id, {'recursive': recursive}, (err) => {
							if (err) {
								this.log.error(`can not delete obsolete object ${obj_name} because: ${err}`);
								return reject();
							} else {
								this.log.debug(`obsolete object '${obj_name}' deleted`);
								return resolve();
							}
						});
					} else {
						this.log.silly(`obsolete object '${obj_name}' found, but name '${obj.common.name.toString()}' does not contain correct device id '${device_id}'.`);
						return resolve();
					}
				} else {
					this.log.silly(`obsolete object '${obj_name}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes the history for a household from the adapter
	 *
	 * @param {number} index
	 * @param {boolean} all
	 * @return {Promise}
	 */
	deleteEventHistoryForHousehold(index, all) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const prefix = this.sureFlapState.households[index].name;
			const numberToDelete = (all ? 25 : this.sureFlapHistory[index].length);

			this.log.debug(`deleting event history from adapter`);
			for (let i = 0; i < numberToDelete; i++) {
				promiseArray.push(this.deleteObjectFormAdapterIfExists(prefix + '.history.' + i, true));
			}
			Promise.all(promiseArray).then(() => {
				return resolve();
			}).catch(err => {
				return reject(err);
			});
		}));
	}

	/**
	 * removes deleted or renamed pets
	 *
	 * @return {Promise}
	 */
	removeDeletedAndRenamedPetsFromAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.log.debug(`searching and removing of deleted and renamed pets`);

			const getObjectsPromiseArray = [];
			const numPets = this.sureFlapState.pets.length;
			const petsChannelNames = [];

			for (let i = 0; i < numPets; i++) {
				const name_org = this.sureFlapState.pets[i].name_org;
				const petId = this.sureFlapState.pets[i].id;
				petsChannelNames.push('Pet \'' + name_org + '\' (' + petId + ')');
			}

			for (let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// check for pets in households
				getObjectsPromiseArray.push(this.getObjectsByPatternAndType(this.name + '.' + this.instance + '.' + prefix + '.pets.*', 'channel', false));

				// check for assigned_pets in devices
				for (let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id === this.sureFlapState.households[h].id) {
						// all devices except hub
						if (this.hasParentDevice(this.sureFlapState.devices[d])) {
							if ([DEVICE_TYPE_FEEDER, DEVICE_TYPE_WATER_DISPENSER, DEVICE_TYPE_PET_FLAP, DEVICE_TYPE_CAT_FLAP].includes(this.sureFlapState.devices[d].product_id)) {
								const obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[d]) + '.' + this.sureFlapState.devices[d].name;

								let type = 'state';
								if ([DEVICE_TYPE_CAT_FLAP].includes(this.sureFlapState.devices[d].product_id)) {
									type = 'channel';
								}

								getObjectsPromiseArray.push(this.getObjectsByPatternAndType(this.name + '.' + this.instance + '.' + obj_name + '.assigned_pets.*', type, false));
							}
						}
					}
				}
			}

			// wait for all get object promises
			Promise.all(getObjectsPromiseArray).then((objs) => {
				const deletePromiseArray = [];
				objs.forEach((obj) => {
					if (obj) {
						Object.keys(obj).forEach((key) => {
							if (!petsChannelNames.includes(obj[key].common.name)) {
								this.log.debug(`deleted or renamed pet ${obj[key]._id} (${obj[key].common.name}) found. trying to delete (${obj[key].type})`);
								deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(obj[key]._id, true));
							}
						});
					}
				});
				Promise.all(deletePromiseArray).then(() => {
					this.log.debug(`searching and removing of deleted and renamed pets complete`);
					return resolve();
				}).catch(() => {
					this.log.warn(`searching and removing of deleted and renamed pets failed`);
					return resolve();
				});
			}).catch(() => {
				this.log.debug(`searching and removing of deleted and renamed pets failed`);
				return resolve();
			});
		}));
	}

	/**
	 * removes obsolete data structures from the adapter
	 * When there are changes to the data structures obsolete entries go here.
	 *
	 * @return {Promise}
	 */
	removeDeprecatedDataFromAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const deletePromiseArray = [];

			this.log.debug(`searching and removing of obsolete objects`);
			for (let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;
				for (let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id === this.sureFlapState.households[h].id) {
						// hardware and firmware version was changed from number to string
						if (this.hasParentDevice(this.sureFlapState.devices[d])) {
							const obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[d]) + '.' + this.sureFlapState.devices[d].name;
							this.log.silly(`checking for version states with type number for device ${obj_name}.`);

							deletePromiseArray.push(this.removeVersionNumberFromDevices(obj_name));
						} else {
							const obj_name = prefix + '.' + this.sureFlapState.devices[d].name;
							this.log.silly(`checking for version states with type number for device ${obj_name}.`);

							deletePromiseArray.push(this.removeVersionNumberFromDevices(obj_name));
						}

						// missing parent object of API change on 2023_10_02 created all devices without hierarchy (as hubs)
						if (this.hasParentDevice(this.sureFlapState.devices[d])) {
							const obj_name = prefix + '.' + this.sureFlapState.devices[d].name;
							this.log.silly(`checking for non hub devices under household with name ${obj_name}.`);

							// remove non hub devices from top hierarchy
							deletePromiseArray.push(this.deleteObsoleteObjectWithDeviceIdIfExists(obj_name, this.sureFlapState.devices[d].id, true));
						}

						// hub
						if (!this.hasParentDevice(this.sureFlapState.devices[d])) {
							const obj_name = prefix + '.' + this.sureFlapState.devices[d].name;
							this.log.silly(`checking for led_mode for hub ${obj_name}.`);

							// made led_mode changeable and moved it to control.led_mode
							deletePromiseArray.push(this.deleteObsoleteObjectIfExists(obj_name + '.led_mode', false));
						} else {
							// feeding bowl
							if (this.sureFlapState.devices[d].product_id === DEVICE_TYPE_FEEDER) {
								// feeding bowl
								const obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[d]) + '.' + this.sureFlapState.devices[d].name;
								this.log.silly(`checking for curfew states for feeder ${obj_name}.`);

								// food_type was removed on 2023_10_02
								// food_type was added again on 2023_10_03
								/*
								deletePromiseArray.push(this.removeObjectIfExists(obj_name + '.bowls.0.food_type'));
								deletePromiseArray.push(this.removeObjectIfExists(obj_name + '.bowls.1.food_type'));
								*/

								// feeder had unnecessary attributes of flap
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(obj_name + '.curfew', true));
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(obj_name + '.last_curfew', true));
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(obj_name + '.curfew_active', false));
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(obj_name + '.control.lockmode', false));
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(obj_name + '.control.curfew', false));
							}
							// pet flap
							if (this.sureFlapState.devices[d].product_id === DEVICE_TYPE_PET_FLAP) {
								// pet flap
								const obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[d]) + '.' + this.sureFlapState.devices[d].name;
								this.log.silly(`checking for pet types for pet flap ${obj_name}.`);

								// pet flap had pet type control which is an exclusive feature of cat flap
								if ('tags' in this.sureFlapState.devices[d]) {
									for (let t = 0; t < this.sureFlapState.devices[d].tags.length; t++) {
										const name = this.getPetNameForTagId(this.sureFlapState.devices[d].tags[t].id);
										if (name !== undefined) {
											deletePromiseArray.push(this.removeAssignedPetsFromPetFlap(obj_name + '.assigned_pets.' + name));
										} else {
											this.log.warn(`could not find pet with pet tag id (${this.sureFlapState.devices[d].tags[t].id})`);
											this.log.debug(`pet flap '${obj_name}' has ${this.sureFlapState.devices[d].tags.length} pets assigned and household has ${this.sureFlapState.pets.length} pets assigned.`);
										}
									}
								}
							}

							// cat flap and pet flap
							if (this.sureFlapState.devices[d].product_id === DEVICE_TYPE_CAT_FLAP || this.sureFlapState.devices[d].product_id === DEVICE_TYPE_PET_FLAP) {
								// remove deprecated curfew objects
								const obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[d]) + '.' + this.sureFlapState.devices[d].name;
								deletePromiseArray.push(this.deleteObsoleteObjectIfExistsAndHasType(obj_name + '.curfew', 'channel', true));
								deletePromiseArray.push(this.deleteObsoleteObjectIfExistsAndHasType(obj_name + '.last_curfew', 'channel', true));
								deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(obj_name + '.control' + '.curfew', false));
							}
						}
					}
				}
				// deprecated history
				if (!this.config.history_enable) {
					for (let h = 0; h < this.sureFlapState.households.length; h++) {
						const prefix = this.sureFlapState.households[h].name;
						this.log.silly(`checking for deprecated event history for household '${prefix}'`);

						deletePromiseArray.push(this.deleteEventHistoryForHousehold(h, true));
					}
				}

				// delete json history events if number of history events decreased
				this.log.silly(`checking for surplus history events.`);
				for (let j = this.config.history_json_entries; j < 25; j++) {
					deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(this.name + '.' + this.instance + '.' + prefix + '.history.json.' + j, false));
				}
			}
			Promise.all(deletePromiseArray).then(() => {
				this.log.debug(`searching and removing of obsolete objects complete`);
				return resolve();
			}).catch(() => {
				this.log.warn(`searching and removing of obsolete objects failed. some obsolete objects may not have been removed.`);
				return resolve();
			});
		}));
	}

	/**
	 * removes firmware and hardware version from devices if they are of type number
	 *
	 * @param {string} obj_name the device name
	 * @return {Promise}
	 */
	removeVersionNumberFromDevices(obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.getObject(obj_name + '.version.firmware', (err, obj) => {
				if (!err && obj && obj.common.type === 'number') {
					this.log.silly(`obsolete number objects in ${obj_name}.version found. trying to delete recursively`);

					this.deleteObsoleteObjectIfExists(obj_name + '.version', true).then(() => {
						return resolve();
					}).catch(() => {
						return reject();
					});
				} else {
					return resolve();
				}
			});
		}));
	}

	/**
	 * removes assigned pets from pet flap
	 *
	 * @param {string} obj_name the device name
	 * @return {Promise}
	 */
	removeAssignedPetsFromPetFlap(obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.getObject(obj_name, (err, obj) => {
				if (!err && obj && obj.type === 'channel') {
					this.log.silly(`obsolete channel object ${obj_name} found. trying to delete recursively`);

					this.deleteObsoleteObjectIfExists(obj_name, true).then(() => {
						this.log.info(`deleted assigned pets for pet flap ${obj_name} because of obsolete control for pet type. please restart adapter to show assigned pets again.`);
						return resolve();
					}).catch(() => {
						return reject();
					});
				} else {
					return resolve();
				}
			});
		}));
	}

	/************************************************
	 * methods to initially create object hierarchy *
	 ************************************************/

	/**
	 * creates the adapters object hierarchy
	 *
	 * @return {Promise}
	 */
	createAdapterObjectHierarchy() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if (this.firstLoop === true) {
				this.log.debug(`creating device hierarchy...`);
				this.removeDeprecatedDataFromAdapter()
					.then(() => this.removeDeletedAndRenamedPetsFromAdapter())
					.then(() => this.createHouseholdsAndHubsToAdapter())
					.then(() => this.createDevicesToAdapter())
					.then(() => this.createPetsToAdapter())
					.then(() => {
						this.log.debug(`device hierarchy created.`);
						return resolve();
					})
					.catch(() => {
						this.log.error(`creating device hierarchy failed.`);
						return reject();
					});
			} else {
				return resolve();
			}
		}));
	}

	/**
	 * creates household and hub data structures in the adapter
	 *
	 * @return {Promise}
	 */
	createHouseholdsAndHubsToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			// households
			for (let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// create household folder
				this.setObjectNotExists(this.sureFlapState.households[h].name, this.buildFolderObject('Household \'' + this.sureFlapState.households[h].name_org + '\' (' + this.sureFlapState.households[h].id + ')'), () => {
					// create history folder
					this.setObjectNotExists(this.sureFlapState.households[h].name + '.history', this.buildFolderObject('Event History'), () => {
						this.setObjectNotExists(this.sureFlapState.households[h].name + '.history.json', this.buildFolderObject('JSON'), () => {
							if (this.config.history_json_enable) {
								// create json history states
								const obj_name = this.sureFlapState.households[h].name + '.history.json.';
								for (let j = 0; j < this.config.history_json_entries; j++) {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + j, this.buildStateObject('history event ' + j, 'json', 'string')));
								}
							}

							// create hub (devices in household without parent)
							for (let d = 0; d < this.sureFlapState.devices.length; d++) {
								if (this.sureFlapState.devices[d].household_id === this.sureFlapState.households[h].id) {
									if (!this.hasParentDevice(this.sureFlapState.devices[d])) {
										const obj_name = prefix + '.' + this.sureFlapState.devices[d].name;
										this.setObjectNotExists(obj_name, this.buildDeviceObject('Hub \'' + this.sureFlapState.devices[d].name_org + '\' (' + this.sureFlapState.devices[d].id + ')'), () => {
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('if device is online', 'indicator.reachable')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.serial_number', this.buildStateObject('serial number of device', 'text', 'string')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control', this.buildChannelObject('control switches')));
											promiseArray.push(this.createVersionsToAdapter(d, obj_name));
											Promise.all(promiseArray).then(() => {
												this.setObjectNotExists(obj_name + '.control.led_mode', this.buildStateObject('led mode', 'indicator', 'number', false, {
													0: 'OFF',
													1: 'HIGH',
													4: 'DIMMED'
												}), () => {
													return resolve();
												});
											}).catch(error => {
												this.log.warn(`could not create household and hub hierarchy (${error})`);
												return reject();
											});
										});
									}
								}
							}
						});
					});
				});
			}
		}));
	}

	/**
	 * creates device hierarchy data structures in the adapter
	 *
	 * @return {Promise}
	 */
	createDevicesToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			// households
			for (let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// create devices in household with parent (flaps, feeding bowl and water dispenser)
				for (let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id === this.sureFlapState.households[h].id) {
						if (this.hasParentDevice(this.sureFlapState.devices[d])) {
							const obj_name = prefix + '.' + this.getParentDeviceName(this.sureFlapState.devices[d]) + '.' + this.sureFlapState.devices[d].name;
							switch (this.sureFlapState.devices[d].product_id) {
								case DEVICE_TYPE_PET_FLAP:
									// pet flap
									promiseArray.push(this.createFlapDevicesToAdapter(d, obj_name, false));
									break;
								case DEVICE_TYPE_CAT_FLAP:
									// cat flap
									promiseArray.push(this.createFlapDevicesToAdapter(d, obj_name, true));
									break;
								case DEVICE_TYPE_FEEDER:
									// feeding bowl
									promiseArray.push(this.createFeederDevicesToAdapter(d, obj_name));
									break;
								case DEVICE_TYPE_WATER_DISPENSER:
									// water dispenser
									promiseArray.push(this.createWaterDispenserDevicesToAdapter(d, obj_name));
									break;
								default:
									this.log.debug(`device with unknown id (${this.sureFlapState.devices[d].product_id}) found`);
									break;
							}
						}
					}
				}
			}
			Promise.all(promiseArray).then(() => {
				return resolve();
			}).catch(error => {
				this.log.warn(`could not create adapter device hierarchy (${error})`);
				return reject();
			});
		}));
	}

	/**
	 * creates online, battery, battery_percentage, serial_number, rssi and versions data structures in the adapter
	 *
	 * @param {number} device
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createCommonStatusToAdapter(device, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('if device is online', 'indicator.reachable')));
			promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery', this.buildStateObject('battery', 'value.voltage', 'number')));
			promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery_percentage', this.buildStateObject('battery percentage', 'value.battery', 'number')));
			promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.serial_number', this.buildStateObject('serial number of device', 'text', 'string')));
			this.setObjectNotExists(obj_name + '.signal', this.buildChannelObject('signal strength'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.signal' + '.device_rssi', this.buildStateObject('device rssi', 'value.signal.rssi', 'number')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.signal' + '.hub_rssi', this.buildStateObject('hub rssi', 'value.signal.rssi', 'number')));
				promiseArray.push(this.createVersionsToAdapter(device, obj_name));
				Promise.all(promiseArray).then(() => {
					this.log.silly(`adapter common status hierarchy for device ${this.sureFlapState.devices[device].name} created`);
					return resolve();
				}).catch(error => {
					this.log.warn(`could not create adapter common status hierarchy for device ${this.sureFlapState.devices[device].name} (${error})`);
					return reject();
				});
			});
		}));
	}

	/**
	 * creates hardware and software versions data structures in the adapter
	 *
	 * @param {number} device
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createVersionsToAdapter(device, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(obj_name + '.version', this.buildChannelObject('version'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.version' + '.hardware', this.buildStateObject('hardware version', 'info.hardware', 'string')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.version' + '.firmware', this.buildStateObject('firmware version', 'info.firmware', 'string')));
				Promise.all(promiseArray).then(() => {
					this.log.silly(`adapter versions hierarchy for device ${this.sureFlapState.devices[device].name} created`);
					return resolve();
				}).catch(error => {
					this.log.warn(`could not create adapter versions hierarchy for device ${this.sureFlapState.devices[device].name} (${error})`);
					return reject();
				});
			});
		}));
	}

	/**
	 * creates cat and pet flap device hierarchy data structures in the adapter
	 *
	 * @param {number} deviceIndex
	 * @param {string} obj_name
	 * @param {boolean} isCatFlap
	 * @return {Promise}
	 */
	createFlapDevicesToAdapter(deviceIndex, obj_name, isCatFlap) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(obj_name, this.buildDeviceObject('Device \'' + this.sureFlapState.devices[deviceIndex].name_org + '\' (' + this.sureFlapState.devices[deviceIndex].id + ')'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.last_enabled_curfew', this.buildStateObject('last enabled curfew settings', 'json', 'string')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.curfew_active', this.buildStateObject('if curfew is enabled and currently active', 'indicator')));
				promiseArray.push(this.createCommonStatusToAdapter(deviceIndex, obj_name));
				this.setObjectNotExists(obj_name + '.control', this.buildChannelObject('control switches'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.lockmode', this.buildStateObject('lockmode', 'switch.mode.lock', 'number', false, {
						0: 'OPEN',
						1: 'LOCK INSIDE',
						2: 'LOCK OUTSIDE',
						3: 'LOCK BOTH'
					})));
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.curfew_enabled', this.buildStateObject('is curfew enabled', 'switch', 'boolean', false)));
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.current_curfew', this.buildStateObject('current curfew settings', 'json', 'string', false)));
					this.setObjectNotExists(obj_name + '.assigned_pets', this.buildChannelObject('assigned pets'), () => {
						if ('tags' in this.sureFlapState.devices[deviceIndex]) {
							for (let t = 0; t < this.sureFlapState.devices[deviceIndex].tags.length; t++) {
								if (isCatFlap) {
									promiseArray.push(this.createAssignedPetsTypeControl(deviceIndex, t, obj_name));
								} else {
									const id = this.getPetIdForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
									const name = this.getPetNameForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
									const name_org = this.getPetNameOrgForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
									if (id !== undefined && name !== undefined && name_org !== undefined) {
										promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name, this.buildStateObject('Pet \'' + name_org + '\' (\'' + id + '\')', 'text', 'string')));
									} else {
										this.log.warn(`could not find pet with pet tag id (${this.sureFlapState.devices[deviceIndex].tags[t].id})`);
										this.log.debug(`pet flap '${this.sureFlapState.devices[deviceIndex].name}' has ${this.sureFlapState.devices[deviceIndex].tags.length} pets assigned and household has ${this.sureFlapState.pets.length} pets assigned.`);
									}
								}
							}
						}
						Promise.all(promiseArray).then(() => {
							return resolve();
						}).catch(error => {
							this.log.warn(`could not create adapter flap device hierarchy (${error})`);
							return reject();
						});
					});
				});
			});
		}));
	}

	/**
	 * creates feeder bowl device hierarchy data structures in the adapter
	 *
	 * @param {number} deviceIndex
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createFeederDevicesToAdapter(deviceIndex, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(obj_name, this.buildDeviceObject('Device \'' + this.sureFlapState.devices[deviceIndex].name_org + '\' (' + this.sureFlapState.devices[deviceIndex].id + ')'), () => {
				promiseArray.push(this.createCommonStatusToAdapter(deviceIndex, obj_name));

				this.setObjectNotExists(obj_name + '.control', this.buildChannelObject('control switches'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.close_delay', this.buildStateObject('closing delay of lid', 'switch.mode.delay', 'number', false, {
						0: 'FAST',
						4: 'NORMAL',
						20: 'SLOW'
					})));

					this.setObjectNotExists(obj_name + '.assigned_pets', this.buildChannelObject('assigned pets'), () => {
						if ('tags' in this.sureFlapState.devices[deviceIndex]) {
							for (let t = 0; t < this.sureFlapState.devices[deviceIndex].tags.length; t++) {
								const id = this.getPetIdForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
								const name = this.getPetNameForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
								const name_org = this.getPetNameOrgForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
								if (id !== undefined && name !== undefined && name_org !== undefined) {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name, this.buildStateObject('Pet \'' + name_org + '\' (' + id + ')', 'text', 'string')));
								} else {
									this.log.warn(`could not find pet with pet tag id (${this.sureFlapState.devices[deviceIndex].tags[t].id})`);
									this.log.debug(`feeder '${this.sureFlapState.devices[deviceIndex].name}' has ${this.sureFlapState.devices[deviceIndex].tags.length} pets assigned and household has ${this.sureFlapState.pets.length} pets assigned.`);
								}
							}

							this.setObjectNotExists(obj_name + '.bowls', this.buildChannelObject('feeding bowls'), () => {
								this.setObjectNotExists(obj_name + '.bowls.0', this.buildChannelObject('feeding bowl 0'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.food_type', this.buildStateObject('type of food in bowl', 'value', 'number', true, {
										1: 'WET',
										2: 'DRY'
									})));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.target', this.buildStateObject('target weight', 'value', 'number')));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.weight', this.buildStateObject('weight', 'value', 'number')));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.fill_percent', this.buildStateObject('fill percentage', 'value', 'number')));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.last_filled_at', this.buildStateObject('last filled at', 'date', 'string')));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.last_zeroed_at', this.buildStateObject('last zeroed at', 'date', 'string')));

									if (this.objectContainsPath(this.sureFlapState.devices[deviceIndex], 'control.bowls.type') && this.sureFlapState.devices[deviceIndex].control.bowls.type === FEEDER_SINGLE_BOWL) {
										// remove bowl 1 (e.g. after change from dual to single bowl)
										promiseArray.push(this.deleteObjectFormAdapterIfExists(obj_name + '.bowls.1', true));
										Promise.all(promiseArray).then(() => {
											return resolve();
										}).catch(error => {
											this.log.warn(`could not create adapter feeder device hierarchy (${error})`);
											return reject();
										});
									} else {
										this.setObjectNotExists(obj_name + '.bowls.1', this.buildChannelObject('feeding bowl 1'), () => {
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.food_type', this.buildStateObject('type of food in bowl', 'value', 'number', true, {
												1: 'WET',
												2: 'DRY'
											})));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.target', this.buildStateObject('target weight', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.weight', this.buildStateObject('weight', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.fill_percent', this.buildStateObject('fill percentage', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.last_filled_at', this.buildStateObject('last filled at', 'date', 'string')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.last_zeroed_at', this.buildStateObject('last zeroed at', 'date', 'string')));

											Promise.all(promiseArray).then(() => {
												return resolve();
											}).catch(error => {
												this.log.warn(`could not create adapter feeder device hierarchy (${error})`);
												return reject();
											});
										});
									}
								});
							});
						} else {
							Promise.all(promiseArray).then(() => {
								return resolve();
							}).catch(error => {
								this.log.warn(`could not create adapter feeder device hierarchy (${error})`);
								return reject();
							});
						}
					});
				});
			});
		}));
	}

	/**
	 * creates water dispenser device hierarchy data structures in the adapter
	 *
	 * @param {number} deviceIndex
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createWaterDispenserDevicesToAdapter(deviceIndex, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(obj_name, this.buildDeviceObject('Device \'' + this.sureFlapState.devices[deviceIndex].name_org + '\' (' + this.sureFlapState.devices[deviceIndex].id + ')'), () => {
				promiseArray.push(this.createCommonStatusToAdapter(deviceIndex, obj_name));

				this.setObjectNotExists(obj_name + '.assigned_pets', this.buildChannelObject('assigned pets'), () => {
					if ('tags' in this.sureFlapState.devices[deviceIndex]) {
						for (let t = 0; t < this.sureFlapState.devices[deviceIndex].tags.length; t++) {
							const id = this.getPetIdForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
							const name = this.getPetNameForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
							const name_org = this.getPetNameOrgForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
							if (id !== undefined && name !== undefined && name_org !== undefined) {
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name, this.buildStateObject('Pet \'' + name_org + '\' (' + id + ')', 'text', 'string')));
							} else {
								this.log.warn(`could not find pet with pet tag id (${this.sureFlapState.devices[deviceIndex].tags[t].id})`);
								this.log.debug(`water dispenser '${this.sureFlapState.devices[deviceIndex].name}' has ${this.sureFlapState.devices[deviceIndex].tags.length} pets assigned and household has ${this.sureFlapState.pets.length} pets assigned.`);
							}
						}
					}
					this.setObjectNotExists(obj_name + '.water', this.buildChannelObject('remaining water'), () => {
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water.weight', this.buildStateObject('weight', 'value', 'number')));
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water.fill_percent', this.buildStateObject('fill percentage', 'value', 'number')));
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water.last_filled_at', this.buildStateObject('last filled at', 'date', 'string')));
						Promise.all(promiseArray).then(() => {
							return resolve();
						}).catch(error => {
							this.log.warn(`could not create adapter water dispenser device hierarchy (${error})`);
							return reject();
						});
					});
				});
			});
		}));
	}

	/**
	 * creates assigned pets and their type control for sureflap adapter
	 *
	 * @param {number} deviceIndex
	 * @param {number} tag
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createAssignedPetsTypeControl(deviceIndex, tag, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const id = this.getPetIdForTagId(this.sureFlapState.devices[deviceIndex].tags[tag].id);
			const name = this.getPetNameForTagId(this.sureFlapState.devices[deviceIndex].tags[tag].id);
			const name_org = this.getPetNameOrgForTagId(this.sureFlapState.devices[deviceIndex].tags[tag].id);
			if (id !== undefined && name !== undefined && name_org !== undefined) {
				this.setObjectNotExists(obj_name + '.assigned_pets.' + name, this.buildChannelObject('Pet \'' + name_org + '\' (' + id + ')'), () => {
					this.setObjectNotExists(obj_name + '.assigned_pets.' + name + '.control', this.buildChannelObject('control switches'), () => {
						this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name + '.control' + '.type', this.buildStateObject('pet type', 'switch.mode.type', 'number', false, {
							2: 'OUTDOOR PET',
							3: 'INDOOR PET'
						})).then(() => {
							return resolve();
						}).catch(error => {
							this.log.warn(`could not create adapter flap device assigned pets hierarchy (${error})`);
							return reject();
						});
					});
				});
			} else {
				this.log.warn(`could not find pet with pet tag id (${this.sureFlapState.devices[deviceIndex].tags[tag].id})`);
				this.log.debug(`cat flap '${this.sureFlapState.devices[deviceIndex].name}' has ${this.sureFlapState.devices[deviceIndex].tags.length} pets assigned and household has ${this.sureFlapState.pets.length} pets assigned.`);
				return reject();
			}
		}));
	}

	/**
	 * creates pet hierarchy data structures in the adapter
	 *
	 * @return {Promise}
	 */
	createPetsToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const numPets = this.sureFlapState.pets.length;

			for (let p = 0; p < numPets; p++) {
				const pet_name = this.sureFlapState.pets[p].name;
				const pet_name_org = this.sureFlapState.pets[p].name_org;
				const pet_id = this.sureFlapState.pets[p].id;
				const household_name = this.getHouseholdNameForId(this.sureFlapState.pets[p].household_id);
				if (household_name !== undefined) {
					const prefix = household_name + '.pets';
					promiseArray.push(this.createPetHierarchyToAdapter(prefix, household_name, pet_name, pet_name_org, pet_id));
				} else {
					if (!this.warnings[PET_HOUSEHOLD_MISSING][p]) {
						this.log.warn(`could not get household for pet (${pet_name})`);
						this.warnings[PET_HOUSEHOLD_MISSING][p] = true;
					}
				}
			}

			Promise.all(promiseArray).then(() => {
				return resolve();
			}).catch(() => {
				this.log.error(`creating pets hierarchy failed.`);
				return reject();
			});
		}));
	}

	/**
	 * creates hierarchy data structures for the given pet in the adapter
	 *
	 * @param {string} prefix
	 * @param {string} household_name
	 * @param {string} pet_name
	 * @param {string} pet_name_org
	 * @param {number} pet_id
	 * @return {Promise}
	 */
	createPetHierarchyToAdapter(prefix, household_name, pet_name, pet_name_org, pet_id) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const obj_name = prefix + '.' + pet_name;
			this.setObjectNotExists(prefix, this.buildDeviceObject('Pets in Household ' + household_name), () => {
				this.setObjectNotExists(obj_name, this.buildChannelObject('Pet \'' + pet_name_org + '\' (' + pet_id + ')'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.name', this.buildStateObject(pet_name_org, 'text', 'string')));
					if (this.hasFlap) {
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.inside', this.buildStateObject('is ' + pet_name + ' inside', 'indicator', 'boolean', false)));
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.since', this.buildStateObject('last location change', 'date', 'string')));
						this.setObjectNotExists(obj_name + '.movement', this.buildFolderObject('movement'), () => {
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.movement' + '.last_time', this.buildStateObject('date and time of last movement', 'date', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.movement' + '.last_direction', this.buildStateObject('direction of last movement', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.movement' + '.last_flap', this.buildStateObject('name of last used flap', 'value', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.movement' + '.last_flap_id', this.buildStateObject('id of last used flap', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.movement' + '.times_outside', this.buildStateObject('number of times outside today', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.movement' + '.time_spent_outside', this.buildStateObject('time spent in seconds outside today', 'value', 'number')));
						});
					}
					if (this.hasFeeder) {
						this.setObjectNotExists(obj_name + '.food', this.buildFolderObject('food'), () => {
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food' + '.last_time_eaten', this.buildStateObject('last time food consumed', 'date', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food' + '.times_eaten', this.buildStateObject('number of times food consumed today', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food' + '.time_spent', this.buildStateObject('time spent in seconds at feeder today', 'value', 'number')));

							this.setObjectNotExists(obj_name + '.food.wet', this.buildFolderObject('wet food (1)'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food.wet' + '.weight', this.buildStateObject('wet food consumed today', 'value', 'number')));

								this.setObjectNotExists(obj_name + '.food.dry', this.buildFolderObject('dry food (2)'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food.dry' + '.weight', this.buildStateObject('dry food consumed today', 'value', 'number')));

									if (this.hasDispenser) {
										this.setObjectNotExists(obj_name + '.water', this.buildFolderObject('water'), () => {
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.last_time_drunk', this.buildStateObject('last time water consumed', 'date', 'string')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.times_drunk', this.buildStateObject('number of times water consumed today', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.time_spent', this.buildStateObject('time spent in seconds at water dispenser today', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.weight', this.buildStateObject('water consumed today', 'value', 'number')));

											Promise.all(promiseArray).then(() => {
												return resolve();
											}).catch(error => {
												this.log.warn(`could not create adapter pet hierarchy (${error})`);
												return reject();
											});
										});
									} else {
										Promise.all(promiseArray).then(() => {
											return resolve();
										}).catch(error => {
											this.log.warn(`could not create adapter pet hierarchy (${error})`);
											return reject();
										});
									}
								});
							});
						});
					} else {
						if (this.hasDispenser) {
							this.setObjectNotExists(obj_name + '.water', this.buildFolderObject('water'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.last_time_drunk', this.buildStateObject('last time water consumed', 'date', 'string')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.times_drunk', this.buildStateObject('number of times water consumed today', 'value', 'number')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.time_spent', this.buildStateObject('time spent in seconds at water dispenser today', 'value', 'number')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.water' + '.weight', this.buildStateObject('water consumed today', 'value', 'number')));

								Promise.all(promiseArray).then(() => {
									return resolve();
								}).catch(error => {
									this.log.warn(`could not create adapter pet hierarchy (${error})`);
									return reject();
								});
							});
						} else {
							Promise.all(promiseArray).then(() => {
								return resolve();
							}).catch(error => {
								this.log.warn(`could not create adapter pet hierarchy (${error})`);
								return reject();
							});
						}
					}
				});
			});
		}));
	}

	/******************
	 * helper methods *
	 ******************/

	/**
	 * sets the offline devices in the surepet data
	 */
	setOfflineDevices() {
		this.sureFlapState.all_devices_online = true;
		this.sureFlapState.offline_devices = [];
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			this.sureFlapState.all_devices_online = this.sureFlapState.all_devices_online && this.sureFlapState.devices[d].status.online;
			if (!this.sureFlapState.devices[d].status.online) {
				this.sureFlapState.offline_devices.push(this.sureFlapState.devices[d].name);
			}
		}
	}

	/**
	 * sets the battery percentage from the battery value
	 */
	calculateBatteryPercentageForDevices() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if (this.sureFlapState.devices[d].status.battery) {
				this.sureFlapState.devices[d].status.battery_percentage = this.calculateBatteryPercentage(this.sureFlapState.devices[d].product_id, this.sureFlapState.devices[d].status.battery);
			}
		}
	}

	/**
	 * determines devices in the household from the surepet data
	 */
	setConnectedDevices() {
		if (this.firstLoop) {
			for (let d = 0; d < this.sureFlapState.devices.length; d++) {
				switch (this.sureFlapState.devices[d].product_id) {
					case DEVICE_TYPE_CAT_FLAP:
					case DEVICE_TYPE_PET_FLAP:
						this.hasFlap = true;
						break;
					case DEVICE_TYPE_FEEDER:
						this.hasFeeder = true;
						break;
					case DEVICE_TYPE_WATER_DISPENSER:
						this.hasDispenser = true;
						break;
				}
			}
		}
	}

	/**
	 * calculates last movement for pet
	 *
	 * @param {string} pet_name
	 * @param {number} household
	 * @returns {object} last used flap data object
	 */
	calculateLastMovement(pet_name, household) {
		const data = {};
		if (Array.isArray(this.sureFlapHistory[household])) {
			for (let i = 0; i < this.sureFlapHistory[household].length; i++) {
				const datapoint = this.sureFlapHistory[household][i];
				if ('type' in datapoint && datapoint.type === 0) {
					if ('pets' in datapoint && Array.isArray(datapoint.pets) && datapoint.pets.length > 0) {
						for (let p = 0; p < datapoint.pets.length; p++) {
							if ('name' in datapoint.pets[p] && pet_name === datapoint.pets[p].name) {
								if ('movements' in datapoint && Array.isArray(datapoint.movements) && datapoint.movements.length > 0) {
									for (let m = 0; m < datapoint.movements.length; m++) {
										if ('direction' in datapoint.movements[m] && datapoint.movements[m].direction !== 0) {
											if ('created_at' in datapoint && 'devices' in datapoint && Array.isArray(datapoint.devices) && datapoint.devices.length > 0) {
												for (let d = 0; d < datapoint.devices.length; d++) {
													if ('product_id' in datapoint.devices[d] && (datapoint.devices[d].product_id === DEVICE_TYPE_CAT_FLAP || datapoint.devices[d].product_id === DEVICE_TYPE_PET_FLAP)) {
														if ('name' in datapoint.devices[d] && 'id' in datapoint.devices[d]) {
															if (!('last_time' in data) || new Date(datapoint.created_at) > new Date(data.last_time)) {
																data.last_direction = datapoint.movements[m].direction;
																data.last_flap = datapoint.devices[d].name;
																data.last_flap_id = datapoint.devices[d].id;
																data.last_time = datapoint.created_at;
															}
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
		return data;
	}

	/**
	 * calculates time outside data for pet
	 *
	 * @param {number} pet
	 * @returns {object} time outside data object
	 */
	calculateTimeOutside(pet) {
		const data = {};
		data.count = 0;
		data.time_spent_outside = 0;
		for (let i = 0; i < this.sureFlapReport[pet].movement.datapoints.length; i++) {
			const datapoint = this.sureFlapReport[pet].movement.datapoints[i];
			if ('from' in datapoint && 'to' in datapoint && !('active' in datapoint)) {
				if (this.isToday(new Date(datapoint.to))) {
					data.count++;
					if ('duration' in datapoint && this.isToday(new Date(datapoint.from))) {
						data.time_spent_outside += datapoint.duration;
					} else {
						if (this.isToday(new Date(datapoint.from))) {
							data.time_spent_outside += Math.floor((new Date(datapoint.to).getTime() - new Date(datapoint.from).getTime()) / 1000);
						} else {
							const todayMidnight = new Date();
							todayMidnight.setHours(0, 0, 0, 0);
							data.time_spent_outside += Math.floor((new Date(datapoint.to).getTime() - todayMidnight.getTime()) / 1000);
						}
					}
					this.log.silly(`datapoint '${i}' is time spent outside today`);
				}
			}
		}
		return data;
	}

	/**
	 * calculates food consumption data for pet
	 *
	 * @param {number} pet
	 * @returns {object} food consumption data object
	 */
	calculateFoodConsumption(pet) {
		const data = {};
		data.count = 0;
		data.last_time = this.getDateFormattedAsISO(new Date(0));
		data.time_spent = 0;
		/**
		 * @type {number[]}
		 */
		data.weight = [];
		data.weight[FEEDER_FOOD_WET] = 0;
		data.weight[FEEDER_FOOD_DRY] = 0;
		for (let i = 0; i < this.sureFlapReport[pet].feeding.datapoints.length; i++) {
			const datapoint = this.sureFlapReport[pet].feeding.datapoints[i];
			if (datapoint.context === 1) {
				if (new Date(datapoint.to) > new Date(data.last_time)) {
					data.last_time = datapoint.to;
				}
				if (this.isToday(new Date(datapoint.to))) {
					data.count++;
					if ('duration' in datapoint) {
						data.time_spent += datapoint.duration;
					} else {
						data.time_spent += Math.floor((new Date(datapoint.to).getTime() - new Date(datapoint.from).getTime()) / 1000);
					}
					this.log.silly(`datapoint '${i}' is food eaten today`);
					for (let b = 0; b < datapoint.weights.length; b++) {
						data.weight[datapoint.weights[b].food_type_id] -= datapoint.weights[b].change;
					}
				}
			}
		}
		return data;
	}

	/**
	 * calculates water consumption data for pet
	 *
	 * @param {number} pet
	 * @returns {object} water consumption data object
	 */
	calculateWaterConsumption(pet) {
		const data = {};
		data.count = 0;
		data.last_time = this.getDateFormattedAsISO(new Date(0));
		data.time_spent = 0;
		data.weight = 0;
		for (let i = 0; i < this.sureFlapReport[pet].drinking.datapoints.length; i++) {
			const datapoint = this.sureFlapReport[pet].drinking.datapoints[i];
			if (datapoint.context === 1) {
				if (new Date(datapoint.to) > new Date(data.last_time)) {
					data.last_time = datapoint.to;
				}
				if (this.isToday(new Date(datapoint.to))) {
					data.count++;
					if ('duration' in datapoint) {
						data.time_spent += datapoint.duration;
					} else {
						data.time_spent += Math.floor((new Date(datapoint.to).getTime() - new Date(datapoint.from).getTime()) / 1000);
					}
					this.log.silly(`datapoint '${i}' is water drunk today`);
					data.weight -= datapoint.weights[0].change;
				}
			}
		}
		return data;
	}

	/**
	 * parses the json string, validates it and returns a curfew object
	 *
	 * @param {string} jsonString a json string containing an array of curfew times
	 * @param {number} device_type contains the type of flap
	 * @returns {*[]|null} a curfew object if parsing and validation was successful, null otherwise
	 */
	validateAndGetCurfewFromJsonString(jsonString, device_type) {
		try {
			const jsonObject = JSON.parse(jsonString);

			if (!Array.isArray(jsonObject) || jsonObject.length === 0) {
				this.log.error(`could not set new curfew because: JSON does not contain an array or array is empty`);
				return null;
			}
			if (DEVICE_TYPE_CAT_FLAP === device_type && jsonObject.length > 4) {
				this.log.error(`could not set new curfew because: cat flap does not support more than 4 curfew times`);
				return null;
			}
			if (DEVICE_TYPE_PET_FLAP === device_type && jsonObject.length > 1) {
				this.log.error(`could not set new curfew because: pet flap does not support more than 1 curfew time`);
				return null;
			}
			if (!this.arrayContainsCurfewAttributes(jsonObject)) {
				this.log.error(`could not set new curfew because: JSON array does not contain lock_time and unlock_time in format HH:MM`);
				return null;
			}

			const curfew = [];
			for (let i = 0; i < jsonObject.length; i++) {
				curfew[i] = {};
				if ('enabled' in jsonObject[i] && typeof (jsonObject[i].enabled) === 'boolean') {
					curfew[i]['enabled'] = jsonObject[i].enabled;
				} else {
					curfew[i]['enabled'] = true;
				}
				curfew[i]['lock_time'] = jsonObject[i].lock_time;
				curfew[i]['unlock_time'] = jsonObject[i].unlock_time;
			}
			return curfew;
		} catch (err) {
			this.log.error(`could not parse new_curfew as JSON because: ${err}`);
			return null;
		}
	}

	/**
	 * Returns whether the curfew is enabled
	 *
	 * @param {object} curfew an array of curfew settings
	 * @return {boolean}
	 */
	isCurfewEnabled(curfew) {
		for (let h = 0; h < curfew.length; h++) {
			if (curfew[h].enabled === true) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Calculates whether the current curfew is active
	 *
	 * @param {object} curfew an array of curfew settings
	 * @return {boolean}
	 */
	isCurfewActive(curfew) {
		const current_date = new Date();
		const current_hour = current_date.getHours();
		const current_minutes = current_date.getMinutes();
		for (let h = 0; h < curfew.length; h++) {
			if ('enabled' in curfew[h] && curfew[h]['enabled'] && 'lock_time' in curfew[h] && 'unlock_time' in curfew[h]) {
				const start = curfew[h]['lock_time'].split(':');
				const end = curfew[h]['unlock_time'].split(':');
				const start_hour = parseInt(start[0]);
				const start_minutes = parseInt(start[1]);
				const end_hour = parseInt(end[0]);
				const end_minutes = parseInt(end[1]);
				//this.log.debug(`curfew ${h} start ${start_hour}:${start_minutes} end ${end_hour}:${end_minutes} current ${current_hour}:${current_minutes}`);
				if (start_hour < end_hour || (start_hour === end_hour && start_minutes < end_minutes)) {
					// current time must be between start and end
					if (start_hour < current_hour || (start_hour === current_hour && start_minutes <= current_minutes)) {
						if (end_hour > current_hour || (end_hour === current_hour && end_minutes > current_minutes)) {
							return true;
						}
					}
				} else {
					// current time must be after start or before end
					if (start_hour < current_hour || (start_hour === current_hour && start_minutes <= current_minutes)) {
						return true;
					} else if (end_hour > current_hour || (end_hour === current_hour && end_minutes > current_minutes)) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * returns whether a device has a parent device
	 *
	 * @param {object} device
	 * @return {boolean} true if the device has a parent device, otherwise false
	 */
	hasParentDevice(device) {
		return 'parent_device_id' in device || 'parent' in device;

	}

	/**
	 * returns the name of the parent device
	 *
	 * @param {object} device
	 * @return {string} the name of the parent device if it exists, otherwise 'undefined'
	 */
	getParentDeviceName(device) {
		if ('parent' in device && 'name' in device.parent) {
			return device.parent.name;
		} else if ('parent_device_id' in device) {
			return this.getDeviceById(device.parent_device_id).name;
		}
		return 'undefined';
	}

	/**
	 * reads a state value from the adapter
	 *
	 * @param {string} obj_name
	 * @return {Promise} Promise of an adapter state value
	 */
	getStateValueFromAdapter(obj_name) {
		return new Promise((resolve, reject) => {
			this.getState(obj_name, (err, obj) => {
				if (obj) {
					return resolve(obj.val);
				} else {
					return reject(err);
				}
			});
		});
	}

	/**
	 * returns the tag index for the tag of the device
	 *
	 * @param {number} device_index
	 * @param {number} tag
	 * @return {number} tag index
	 */
	getTagIndexForDeviceIndex(device_index, tag) {
		if ('tags' in this.sureFlapState.devices[device_index]) {
			for (let i = 0; i < this.sureFlapState.devices[device_index].tags.length; i++) {
				if (this.sureFlapState.devices[device_index].tags[i].id === tag) {
					return i;
				}
			}
		}
		return -1;
	}

	/**
	 * returns the device id of the device
	 *
	 * @param {string} name name of the device
	 * @param {Array} device_types allowed device types
	 * @return {string} device id
	 */
	getDeviceId(name, device_types) {
		for (let i = 0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name && device_types.includes(this.sureFlapState.devices[i].product_id)) {
				return this.sureFlapState.devices[i].id;
			}
		}
		return '';
	}

	/**
	 * returns the device index
	 *
	 * @param {string} name
	 * @param {Array} device_types allowed device types
	 * @return {number} device index
	 */
	getDeviceIndex(name, device_types) {
		for (let i = 0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name && device_types.includes(this.sureFlapState.devices[i].product_id)) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the device type of the device
	 *
	 * @param {string} name
	 * @param {Array} device_types allowed device types
	 * @return {number} device type
	 */
	getDeviceTypeByDeviceName(name, device_types) {
		for (let i = 0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name && device_types.includes(this.sureFlapState.devices[i].product_id)) {
				return this.sureFlapState.devices[i].product_id;
			}
		}
		return -1;
	}

	/**
	 * returns the device with the given id
	 *
	 * @param {string} id
	 * @return {object} device
	 */
	getDeviceById(id) {
		for (let i = 0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].id === id) {
				return this.sureFlapState.devices[i];
			}
		}
		return undefined;
	}

	/**
	 * returns the pet id of the pet
	 *
	 * @param {string} name
	 * @return {string|undefined} pet id
	 */
	getPetId(name) {
		for (let i = 0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return this.sureFlapState.pets[i].id;
			}
		}
		return undefined;
	}

	/**
	 * returns the tag id of the pet
	 *
	 * @param {string} name
	 * @return {number} tag id
	 */
	getPetTagId(name) {
		for (let i = 0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return this.sureFlapState.pets[i].tag_id;
			}
		}
		return -1;
	}

	/**
	 * returns the pet index of the pet
	 *
	 * @param {string} name
	 * @return {number} pet index
	 */
	getPetIndex(name) {
		for (let i = 0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the pet id of the tag id
	 *
	 * @param {number} tag_id
	 * @return {string|undefined} pet id
	 */
	getPetIdForTagId(tag_id) {
		for (let i = 0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].tag_id === tag_id) {
				return this.sureFlapState.pets[i].id;
			}
		}
		return undefined;
	}

	/**
	 * returns the pet name of the tag id
	 *
	 * @param {number} tag_id
	 * @return {string|undefined} pet name
	 */
	getPetNameForTagId(tag_id) {
		for (let i = 0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].tag_id === tag_id) {
				return this.sureFlapState.pets[i].name;
			}
		}
		return undefined;
	}

	/**
	 * returns the original (non normalized) pet name of the tag id
	 *
	 * @param {number} tag_id
	 * @return {string|undefined} original pet name
	 */
	getPetNameOrgForTagId(tag_id) {
		for (let i = 0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].tag_id === tag_id) {
				return this.sureFlapState.pets[i].name_org;
			}
		}
		return undefined;
	}

	/**
	 * returns the household name of given household id
	 *
	 * @param {string} id a household id
	 * @return {string|undefined} household name
	 */
	getHouseholdNameForId(id) {
		for (let i = 0; i < this.sureFlapState.households.length; i++) {
			if (this.sureFlapState.households[i].id === id) {
				return this.sureFlapState.households[i].name;
			}
		}
		return undefined;
	}

	/**
	 * returns the household index of given household id
	 *
	 * @param {string} id a household id
	 * @return {number} household index
	 */
	getHouseholdIndexForId(id) {
		for (let i = 0; i < this.sureFlapState.households.length; i++) {
			if (this.sureFlapState.households[i].id === id) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * normalizes lockmode by changing lockmode 4 to 0
	 * Cat flap has 4 lockmodes, pet flap has 5 lockmodes (extra mode for curfew)
	 * Since control should be the same for both flaps, lockmode 4 is removed
	 * and curfew is controlled via control.curfew_enabled
	 */
	normalizeLockMode() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if ('locking' in this.sureFlapState.devices[d].status && 'mode' in this.sureFlapState.devices[d].status.locking) {
				if (this.sureFlapState.devices[d].status.locking.mode === 4) {
					this.sureFlapState.devices[d].status.locking.mode = 0;
				}
			}
		}
	}

	/**
	 * checks every flap and makes the curfew an array if it's not
	 * additional the times are converted from UTC to local time
	 */
	normalizeCurfew() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if ([DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP].includes(this.sureFlapState.devices[d].product_id)) {
				if ('curfew' in this.sureFlapState.devices[d].control) {
					if (!Array.isArray(this.sureFlapState.devices[d].control.curfew)) {
						this.sureFlapState.devices[d].control.curfew = [this.sureFlapState.devices[d].control.curfew];
					}
					for (let c = 0; c < this.sureFlapState.devices[d].control.curfew.length; c++) {
						if ('lock_time' in this.sureFlapState.devices[d].control.curfew[c] && 'unlock_time' in this.sureFlapState.devices[d].control.curfew[c]) {
							this.sureFlapState.devices[d].control.curfew[c].lock_time = this.convertUtcTimeToLocalTime(this.sureFlapState.devices[d].control.curfew[c].lock_time);
							this.sureFlapState.devices[d].control.curfew[c].unlock_time = this.convertUtcTimeToLocalTime(this.sureFlapState.devices[d].control.curfew[c].unlock_time);
						}
					}
				} else {
					this.sureFlapState.devices[d].control.curfew = [];
				}
			}
		}
	}

	/**
	 * applies a smooth filter to flatten outliers in battery values
	 */
	smoothBatteryOutliers() {
		if (this.sureFlapStatePrev.devices) {
			for (let d = 0; d < this.sureFlapState.devices.length; d++) {
				if (this.sureFlapState.devices[d].status.battery) {
					if (this.sureFlapState.devices[d].status.battery > this.sureFlapStatePrev.devices[d].status.battery) {
						this.sureFlapState.devices[d].status.battery = Math.ceil(this.sureFlapState.devices[d].status.battery * 10 + this.sureFlapStatePrev.devices[d].status.battery * 990) / 1000;
					} else if (this.sureFlapState.devices[d].status.battery < this.sureFlapStatePrev.devices[d].status.battery) {
						this.sureFlapState.devices[d].status.battery = Math.floor(this.sureFlapState.devices[d].status.battery * 10 + this.sureFlapStatePrev.devices[d].status.battery * 990) / 1000;
					}
				}
			}
		}
	}

	/**
	 * removes whitespaces and special characters from device, household and pet names
	 */
	makeNamesCanonical() {
		const reg = /\W/ig;
		const rep = '_';

		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if (this.sureFlapState.devices[d].name) {
				this.sureFlapState.devices[d].name_org = this.sureFlapState.devices[d].name;
				this.sureFlapState.devices[d].name = this.sureFlapState.devices[d].name_org.replace(reg, rep);
			}
			if (this.sureFlapState.devices[d].parent && this.sureFlapState.devices[d].parent.name) {
				this.sureFlapState.devices[d].parent.name_org = this.sureFlapState.devices[d].parent.name;
				this.sureFlapState.devices[d].parent.name = this.sureFlapState.devices[d].parent.name_org.replace(reg, rep);
			}
		}
		for (let d = 0; d < this.sureFlapState.households.length; d++) {
			if (this.sureFlapState.households[d].name) {
				this.sureFlapState.households[d].name_org = this.sureFlapState.households[d].name;
				this.sureFlapState.households[d].name = this.sureFlapState.households[d].name_org.replace(reg, rep);
			}
		}
		for (let d = 0; d < this.sureFlapState.pets.length; d++) {
			if (this.sureFlapState.pets[d].name) {
				this.sureFlapState.pets[d].name_org = this.sureFlapState.pets[d].name;
				this.sureFlapState.pets[d].name = this.sureFlapState.pets[d].name_org.replace(reg, rep);
			}
		}
	}

	/**
	 * Returns the value of a deep object defined by path.
	 *
	 * @param {Object} obj an object with deep values
	 * @param {String} path the path to the desired value
	 * @returns {any|undefined} the deep value or undefined
	 */
	getObjectValueForPath(obj, path) {
		return path.split('.').reduce((deep_object, path_part) => (deep_object ? deep_object[path_part] : undefined), obj);
	}

	/**
	 * Determines whether an object contains a deep object defined by path.
	 *
	 * @param {Object} obj an object with deep values
	 * @param {String} path the path to the deep object
	 * @returns {boolean} true, if object contains a value at the specified path, false otherwise
	 */
	objectContainsPath(obj, path) {
		return this.getObjectValueForPath(obj, path) !== undefined;
	}

	/**
	 * returns whether the array contains an object
	 *
	 * @param {Array} arr an array
	 * @returns true if the array contains an entry of type object, false otherwise
	 */
	arrayContainsObjects(arr) {
		if (Array.isArray(arr)) {
			for (let i = 0; i < arr.length; i++) {
				if (typeof (arr[i]) === 'object') {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * checks whether the json array contains curfew times
	 *
	 * @param {object} jsonArray a json array object
	 * @returns {boolean} true if the json array contains curfew times, false otherwise
	 */
	arrayContainsCurfewAttributes(jsonArray) {
		for (let i = 0; i < jsonArray.length; i++) {
			if (!this.containsCurfewAttributes(jsonArray[i])) {
				return false;
			}
		}
		return true;
	}

	/**
	 * checks whether the json object contains a curfew time
	 *
	 * @param {object} json a json object
	 * @returns {boolean} true if the json contains a curfew time
	 */
	containsCurfewAttributes(json) {
		if ('lock_time' in json && 'unlock_time' in json) {
			const timeRegex = new RegExp('^([01][0-9]|2[0-3]):([0-5][0-9])$');
			return json.lock_time.match(timeRegex) && json.unlock_time.match(timeRegex);
		} else {
			return false;
		}
	}

	/**
	 * Returns whether the array of ids is a device control
	 *
	 * @param {Array} idArray an array of ids
	 * @returns true, if it is a device control id, false otherwise
	 */
	isDeviceControl(idArray) {
		return idArray.length > 5 && idArray[idArray.length - 2] === 'control';
	}

	/**
	 * Returns whether the array of ids is a device control for a flap
	 *
	 * @param {Array} idArray an array of ids
	 * @returns true, if it is a device control for a flap id, false otherwise
	 */
	isFlapControl(idArray) {
		return ['curfew_enabled', 'lockmode', 'current_curfew', 'type'].includes(idArray[idArray.length - 1]);
	}

	/**
	 * Returns whether the array of ids is a device control for a feeder
	 *
	 * @param {Array} idArray an array of ids
	 * @returns true, if it is a device control for a feeder id, false otherwise
	 */
	isFeederControl(idArray) {
		return ['close_delay'].includes(idArray[idArray.length - 1]);
	}

	/**
	 * Returns whether the array of ids is a device control for a hub
	 *
	 * @param {Array} idArray an array of ids
	 * @returns true, if it is a device control for a hub id, false otherwise
	 */
	isHubControl(idArray) {
		return ['led_mode'].includes(idArray[idArray.length - 1]);
	}

	/**
	 * Returns whether the array of ids is a pet location
	 *
	 * @param {Array} idArray an array of ids
	 * @returns true, if it is a pet location id, false otherwise
	 */
	isPetLocation(idArray) {
		return idArray.length > 4 && idArray[idArray.length - 3] === 'pets' && idArray[idArray.length - 1] === 'inside';
	}

	/**
	 * returns whether the date is today
	 *
	 * @param {Date} date
	 * @returns true if the date is today, false otherwise
	 */
	isToday(date) {
		const today = new Date();
		return today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate();
	}

	/**
	 * returns the current date and time as Y-m-d H:i
	 *
	 * @return {string}
	 */
	getCurrentDateFormattedForSurepetApi() {
		const date = new Date().toISOString();
		return date.slice(0, 10) + ' ' + date.slice(11, 16);
	}

	/**
	 * returns the current date in ISO format with timezone
	 *
	 * @return {string}
	 */
	getCurrentDateFormattedAsISO() {
		return this.getDateFormattedAsISO(new Date());
	}

	/**
	 * returns the current date in ISO format with timezone
	 * @param {Date} date
	 * @return {string}
	 */
	getDateFormattedAsISO(date) {
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
	 * Converts a HH:MM time string from UTC time to local time
	 *
	 * @param {string} time a time in format HH:MM
	 * @returns {string} a time in format HH:MM
	 */
	convertUtcTimeToLocalTime(time) {
		const time_parts = time.split(':');
		if (time_parts.length === 2) {
			const utc_time = new Date();
			utc_time.setUTCHours(parseInt(time_parts[0]));
			utc_time.setUTCMinutes(parseInt(time_parts[1]));
			return utc_time.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
		} else {
			return time;
		}
	}

	/**
	 * a time part with a leading 0 if smaller then 10
	 *
	 * @param {number} num
	 * @return {string}
	 */
	padZero(num) {
		const norm = Math.floor(Math.abs(num));
		return (norm < 10 ? '0' : '') + norm;
	}

	/**
	 * returns the battery percentage
	 *
	 * @param {number} deviceId
	 * @param {number} battery
	 * @return {number}
	 */
	calculateBatteryPercentage(deviceId, battery) {
		switch (deviceId) {
			case DEVICE_TYPE_FEEDER:
				// feeding bowl
				if (battery <= this.config.felaqua_battery_empty) {
					return 0;
				} else if (battery >= this.config.felaqua_battery_full) {
					return 100;
				} else {
					return Math.round(((battery - this.config.felaqua_battery_empty) / (this.config.felaqua_battery_full - this.config.felaqua_battery_empty)) * 100);
				}
			case DEVICE_TYPE_WATER_DISPENSER:
				// water dispenser
				if (battery <= this.config.surefeed_battery_empty) {
					return 0;
				} else if (battery >= this.config.surefeed_battery_full) {
					return 100;
				} else {
					return Math.round(((battery - this.config.surefeed_battery_empty) / (this.config.surefeed_battery_full - this.config.surefeed_battery_empty)) * 100);
				}
			default:
				// flaps
				if (battery <= this.config.sureflap_battery_empty) {
					return 0;
				} else if (battery >= this.config.sureflap_battery_full) {
					return 100;
				} else {
					return Math.round(((battery - this.config.sureflap_battery_empty) / (this.config.sureflap_battery_full - this.config.sureflap_battery_empty)) * 100);
				}
		}

	}

	/**
	 * checks and logs the values of the adapter configuration and sets default values in case of invalid values
	 */
	checkAdapterConfig() {
		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		let configOk = true;
		this.log.info('checking adapter configuration...');
		if (!this.config.username || typeof this.config.username !== 'string' || this.config.username.length === 0) {
			this.log.warn(`Username is invalid. Adapter probably won't work.`);
			configOk = false;
		}
		if (!this.config.password || typeof this.config.password !== 'string' || this.config.password.length === 0) {
			this.log.warn(`Password is invalid. Adapter probably won't work.`);
			configOk = false;
		}
		if (!this.config.api_host || typeof this.config.api_host !== 'string' || this.config.api_host.length === 0) {
			this.log.warn(`API host is invalid, using default value.`);
			this.config.api_host = 'app-api.production.surehub.io';
			configOk = false;
		}
		if (!this.config.sureflap_battery_full || !this.config.sureflap_battery_empty || this.config.sureflap_battery_full <= this.config.sureflap_battery_empty) {
			this.log.warn(`Battery voltage values for sureflap are invalid, using default values.`);
			this.config.sureflap_battery_full = 6.1;
			this.config.sureflap_battery_empty = 5.1;
			configOk = false;
		}
		if (!this.config.surefeed_battery_full || !this.config.surefeed_battery_empty || this.config.surefeed_battery_full <= this.config.surefeed_battery_empty) {
			this.log.warn(`Battery voltage values for surefeed are invalid, using default values.`);
			this.config.surefeed_battery_full = 6.2;
			this.config.surefeed_battery_empty = 5.2;
			configOk = false;
		}
		if (!this.config.felaqua_battery_full || !this.config.felaqua_battery_empty || this.config.felaqua_battery_full <= this.config.felaqua_battery_empty) {
			this.log.warn(`Battery voltage values for felaqua are invalid, using default values.`);
			this.config.felaqua_battery_full = 6.2;
			this.config.felaqua_battery_empty = 5.2;
			configOk = false;
		}
		if (this.config.history_enable === undefined || typeof this.config.history_enable !== 'boolean') {
			this.log.warn(`History toggle is invalid, using default value.`);
			this.config.history_enable = false;
			configOk = false;
		}
		if (this.config.history_entries === undefined || typeof this.config.history_entries !== 'number' || this.config.history_entries > 25 || this.config.history_entries < 1) {
			this.log.warn(`Number of history entries is invalid, using default value.`);
			this.config.history_entries = 10;
			configOk = false;
		}
		this.log.info('API host: ' + this.config.api_host);
		this.log.info('sureflap battery voltage full: ' + this.config.sureflap_battery_full);
		this.log.info('sureflap battery voltage empty: ' + this.config.sureflap_battery_empty);
		this.log.info('surefeed battery voltage full: ' + this.config.surefeed_battery_full);
		this.log.info('surefeed battery voltage empty: ' + this.config.surefeed_battery_empty);
		this.log.info('felaqua battery voltage full: ' + this.config.felaqua_battery_full);
		this.log.info('felaqua battery voltage empty: ' + this.config.felaqua_battery_empty);
		this.log.info('history enabled: ' + this.config.history_enable);
		this.log.info('number of history entries: ' + this.config.history_entries);
		if (configOk) {
			this.log.info('adapter configuration ok');
		} else {
			this.log.info('adapter configuration contains errors');
		}
	}

	/**
	 * builds an options JSon object for a http request
	 *
	 * @param {string} path
	 * @param {string} method
	 * @param {string} token
	 * @param {boolean} react
	 * @return {object}
	 */
	buildOptions(path, method, token, react = false) {
		const options = {
			hostname: this.config.api_host,
			port: 443,
			path: path,
			method: method,
			timeout: REQUEST_TIMEOUT,
			headers: {
				'Host': this.config.api_host,
				'Accept': 'application/json, text/plain, */*',
				'Referer': 'https://surepetcare.io/',
				'Content-Type': 'application/json;charset=utf-8',
				'User-Agent': 'ioBroker/7.0',
				'Origin': 'https://surepetcare.io',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache'
			}
		};

		if (react) {
			options.headers['spc-client-type'] = 'react';
		}

		if (token !== undefined && token !== '') {
			options.headers['Authorization'] = 'Bearer ' + token;
		}

		return options;
	}

	/**
	 * builds a login JSon data object
	 *
	 * @return {object}
	 */
	buildLoginJsonData() {
		return {
			// @ts-ignore
			'email_address': this.config.username,
			// @ts-ignore
			'password': this.config.password,
			'device_id': '1050547954'
		};
	}

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
	 * builds a state object
	 *
	 * @param {string} name
	 * @param {string} role
	 * @param {string} type
	 * @param {boolean} readonly
	 * @param {object} states
	 * @return {object}
	 */
	buildStateObject(name, role = 'indicator', type = 'boolean', readonly = true, states = undefined) {
		return states === undefined ? {
			type: 'state',
			common: {
				name: name,
				role: role,
				type: type,
				read: true,
				write: !readonly
			},
			native: {}
		} : {
			type: 'state',
			common: {
				name: name,
				role: role,
				type: type,
				read: true,
				write: !readonly,
				states: states
			},
			native: {}
		};
	}

	/**
	 * builds a device object
	 *
	 * @param {string} name
	 * @return {object}
	 */
	buildDeviceObject(name) {
		return {
			type: 'device',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
	 * builds a channel object
	 *
	 * @param {string} name
	 * @return {object}
	 */
	buildChannelObject(name) {
		return {
			type: 'channel',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
	 * builds a folder object
	 *
	 * @param {string} name
	 * @return {object}
	 */
	buildFolderObject(name) {
		return {
			type: 'folder',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
	 * does a http request
	 *
	 * @param {string} tag
	 * @param {object} options
	 * @param {object} postData
	 * @return {Promise} Promise of an response JSon object
	 */
	httpRequest(tag, options, postData) {
		return new Promise((resolve, reject) => {
			this.log.silly(`doing http request '${tag}'`);
			const req = https.request(options, (res) => {
				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					this.log.debug(`Request (${tag}) returned status code ${res.statusCode}.`);
					return reject(new Error(`Request returned status code ${res.statusCode}. Retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
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
								this.log.debug(`JSon parse error in data: '${data}'`);
							}
							this.log.debug(`Response (${tag}) error.`);
							return reject(new Error(`Response error: '${err}'. Retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
						}
					});
					res.on('error', (err) => {
						this.log.debug(`Response (${tag}) error.`);
						return reject(new Error(`Response error: '${err}'. Retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
					});
				}
			});

			req.on('error', (err) => {
				this.log.debug(`Request (${tag}) error.`);
				return reject(new Error(`Request error: '${err}'. Retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
			});

			req.on('timeout', () => {
				req.destroy();
				this.log.debug(`Request (${tag}) timeout.`);
				return reject(new Error(`Request timeout. Retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
			});

			req.write(postData);
			req.end();
		});
	}
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Sureflap(options);
} else {
	// otherwise start the instance directly
	new Sureflap();
}
