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
const util = require('util');
const SurepetApi = require('./lib/surepet-api');

const ADAPTER_VERSION = '3.2.1';

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
		// init api
		this.api = new SurepetApi(this);

		/* update loop status */
		// number of login attempts
		this.numberOfLogins = 0;
		// is first update loop
		this.firstLoop = true;
		// timer id
		this.timerId = 0;
		// adapter unloaded
		this.adapterUnloaded = false;
		// last history update timestamp
		this.lastHistoryUpdate = 0;
		// update history this loop
		this.updateHistory = false;
		// last aggregated report update timestamp
		this.lastReportUpdate = 0;
		// update aggregated report this loop
		this.updateReport = false;

		/* connected device types */
		// flap connected to hub
		this.hasFlap = false;
		// feeder connected to hub
		this.hasFeeder = false;
		// water dispenser connected to hub
		this.hasDispenser = false;

		/* current and previous data from surepet API */
		// auth token
		this.authToken = undefined;
		// list of households
		this.households = [];
		// list of pets
		this.pets = undefined;
		// previous list of pets
		this.petsPrev = undefined;
		// list of devices per household
		this.devices = {};
		// previous list of devices per household
		this.devicesPrev = {};
		// history
		this.history = {};
		// previous history
		this.historyPrev = {};
		// pet reports
		this.report = [];
		// previous pet reports
		this.reportPrev = [];
		// are all devices online
		this.allDevicesOnline = undefined;
		// were all devices online prev
		this.allDevicesOnlinePrev = undefined;
		// list of offline devices
		this.offlineDevices = [];
		// list of previously offline devices
		this.offlineDevicesPrev = [];
		// is curfew active
		this.curfewActive = undefined;
		// was curfew previously active
		this.curfewActivePrev = undefined;

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
		this.lastError = undefined;
		this.lastLoginError = undefined;

		// promisify setObjectNotExists
		this.setObjectNotExistsPromise = util.promisify(this.setObjectNotExists);

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on('message', this.onMessage.bind(this));
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

	/**
	 * Processes incoming messages
	 *
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		this.log.debug(`[onMessage] Message received`);
		if (obj) {
			if (obj.command === 'testLogin') {
				this.log.debug(`[onMessage] received command ${obj.command} from ${obj.from}`);
				try {
					const host = obj.message?.host;
					const username = obj.message?.username;
					const password = obj.message?.password;

					if (host && username && password) {
						this.api.doLoginAndGetAuthTokenForHostAndUsernameAndPassword(host, username, password).then(async token => {
							if (token) {
								this.log.debug(`[onMessage] ${obj.command} result: Login successful`);
								obj.callback && this.sendTo(obj.from, obj.command, {
									native: {
										'_login': true,
										'_error': null
									}
								}, obj.callback);
							} else {
								this.log.debug(`[onMessage] ${obj.command} result: Login failed`);
								obj.callback && this.sendTo(obj.from, obj.command, {native: {'_error': `Error: Login failed`}}, obj.callback);
							}
						}).catch(err => {
							this.log.error(`[onMessage] ${obj.command} err: ${err}`);
							obj.callback && this.sendTo(obj.from, obj.command, {native: {'_error': `Error: ${err}`}}, obj.callback);
						});

					} else {
						this.log.error(`[onMessage] ${obj.command} err: Host or Username or Password not set`);
						if (!host) {
							obj.callback && this.sendTo(obj.from, obj.command, {native: {'_error': `Error: host not defined/found`}}, obj.callback);
						} else if (!username) {
							obj.callback && this.sendTo(obj.from, obj.command, {native: {'_error': `Error: username not defined/found`}}, obj.callback);
						} else {
							obj.callback && this.sendTo(obj.from, obj.command, {native: {'_error': `Error: password not defined/found`}}, obj.callback);
						}
					}
				} catch (err) {
					this.log.error(`[onMessage] ${obj.command} err: ${err}`);
					obj.callback && this.sendTo(obj.from, obj.command, {native: {'_error': `Error: ${err}`}}, obj.callback);
				}
			}
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
					const deviceName = l[4];
					const control = l[l.length - 1];

					if (control === 'curfew_enabled') {
						this.changeCurfewEnabled(hierarchy, deviceName, state.val === true);
					} else if (control === 'lockmode' && typeof (state.val) === 'number') {
						this.changeFlapLockMode(hierarchy, deviceName, state.val);
					} else if (control === 'current_curfew' && typeof (state.val) === 'string') {
						this.changeCurrentCurfew(hierarchy, deviceName, state.val);
					} else if (control === 'type' && typeof (state.val) === 'number') {
						const petName = l[l.length - 2];
						const petTagId = this.getPetTagId(petName);
						this.changeFlapPetType(hierarchy, deviceName, petName, petTagId, state.val);
					}
				} else if (this.isFeederControl(l)) {
					// change in control section of feeder
					const hierarchy = l.slice(2, l.length - 2).join('.');
					const deviceName = l[4];
					const control = l[l.length - 1];

					if (control === 'close_delay' && typeof (state.val) === 'number') {
						this.changeFeederCloseDelay(hierarchy, deviceName, state.val);
					}
				} else if (this.isHubControl(l)) {
					// change hub led mode
					const hierarchy = l.slice(2, l.length - 3).join('.');
					const hub = l[l.length - 3];
					this.changeHubLedMode(hierarchy, hub, Number(state.val));
				} else if (this.isPetAssigment(l)) {
					// change pet assigment to device
					const hierarchy = l.slice(2, l.length - 3).join('.');
					const deviceName = l[4];
					const petName = l[l.length - 2];
					this.changePetAssigment(hierarchy, deviceName, petName, state.val === true);
				} else {
					this.log.warn(`not allowed to change object ${id}`);
				}
			} else if (this.isPetLocation(l)) {
				// change of pet location
				const hierarchy = l.slice(2, l.length - 3).join('.');
				const petName = l[l.length - 2];
				this.changePetLocation(hierarchy, petName, state.val === true);
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
			.then(() => this.getHouseholds())
			.then(() => this.startUpdateLoop())
			.catch(error => {
				if (error === undefined || error.message === undefined || error.message === this.lastLoginError) {
					this.log.debug(error);
				} else {
					this.log.error(error);
					this.lastLoginError = error.message;
				}
				this.log.info(`disconnected`);
				if (!this.adapterUnloaded) {
					this.log.info(`Restarting in ${RETRY_FREQUENCY_LOGIN} seconds`);
					// @ts-ignore
					this.timerId = setTimeout(this.startLoadingData.bind(this), RETRY_FREQUENCY_LOGIN * 1000);
				}
			});
	}

	/**
	 * starts the update loop
	 *
	 * @return {Promise}
	 */
	startUpdateLoop() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.lastLoginError = undefined;
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
		this.getDevices()
			.then(() => this.getPets())
			.then(() => this.getEventHistory())
			.then(() => this.getPetReports())
			.then(() => this.createAdapterObjectHierarchy())
			.then(() => this.updateDevices())
			.then(() => this.updatePets())
			.then(() => this.updateEventHistory())
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
					this.log.info(`Restarting in ${RETRY_FREQUENCY_LOGIN} seconds`);
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
	 * authenticate and store auth token
	 *
	 * @return {Promise}
	 */
	doAuthenticate() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.setConnectionStatusToAdapter(false);
			this.numberOfLogins++;
			this.log.info(`connecting...`);
			this.log.debug(`login count: ${this.numberOfLogins}`);
			this.api.doLoginAndGetAuthToken().then(token => {
				this.authToken = token;
				this.setConnectionStatusToAdapter(true);
				this.log.info(`connected`);
				this.numberOfLogins = 0;
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * get households
	 *
	 * @return {Promise}
	 */
	getHouseholds() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.api.getHouseholds(this.authToken).then(households => {
				this.households = households;
				this.normalizeHouseholdNames();
				this.log.info(households.length === 1 ? `Got 1 household` : `Got ${households.length} households`);
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * gets the data for devices
	 *
	 * @return {Promise}
	 */
	getDevices() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				promiseArray.push(this.api.getDevicesForHousehold(this.authToken, hid));
			}
			Promise.all(promiseArray).then((values) => {
				let deviceCount = 0;
				for (let h = 0; h < this.households.length; h++) {
					const hid = this.households[h].id;
					if (values[h] === undefined) {
						return reject(new Error(`getting devices failed.`));
					} else {
						if (this.devices[hid] !== undefined) {
							this.devicesPrev[hid] = JSON.parse(JSON.stringify(this.devices[hid]));
						}
						this.devices[hid] = values[h];
						deviceCount += this.devices[hid].length;
					}
				}

				this.normalizeDeviceNames();
				this.normalizeCurfew();
				this.normalizeLockMode();
				this.smoothBatteryOutliers();
				this.getOfflineDevices();
				this.calculateBatteryPercentageForDevices();
				this.getConnectedDeviceTypes();
				this.setLastUpdateToAdapter();
				if (this.firstLoop) {
					this.log.info(deviceCount === 1 ? `Got 1 device` : `Got ${deviceCount} devices`);
				}
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * gets the data for pets
	 *
	 * @return {Promise}
	 */
	getPets() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.api.getPets(this.authToken).then(pets => {
				if (this.pets !== undefined) {
					this.petsPrev = JSON.parse(JSON.stringify(this.pets));
				}
				this.pets = pets;
				this.normalizePetNames();
				if (this.firstLoop) {
					this.log.info(pets.length === 1 ? `Got 1 pet` : `Got ${pets.length} pets`);
				}
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * gets the event history data
	 *
	 * @return {Promise}
	 */
	getEventHistory() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.updateHistory = false;
			if (this.lastHistoryUpdate + UPDATE_FREQUENCY_HISTORY * 1000 < Date.now()) {
				const promiseArray = [];
				for (let h = 0; h < this.households.length; h++) {
					promiseArray.push(this.api.getHistoryForHousehold(this.authToken, this.households[h].id));
				}
				Promise.all(promiseArray).then((values) => {
					for (let h = 0; h < this.households.length; h++) {
						const hid = this.households[h].id;
						if (values[h] === undefined) {
							return reject(new Error(`getting history failed.`));
						} else {
							if (this.history[hid] !== undefined) {
								this.historyPrev[hid] = JSON.parse(JSON.stringify(this.history[hid]));
							}
							this.history[hid] = values[h];
						}
					}
					this.lastHistoryUpdate = Date.now();
					this.updateHistory = true;
					return resolve();
				}).catch(err => {
					return reject(err);
				});
			} else {
				return resolve();
			}
		}));
	}

	/**
	 * gets the aggregated reports for all pets
	 *
	 * @return {Promise}
	 */
	getPetReports() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.updateReport = false;
			if ((!this.updateHistory || this.firstLoop) && (this.hasFeeder || this.hasDispenser || this.hasFlap) && this.lastReportUpdate + UPDATE_FREQUENCY_REPORT * 1000 < Date.now()) {
				const promiseArray = [];
				for (let p = 0; p < this.pets.length; p++) {
					promiseArray.push(this.api.getReportForPet(this.authToken, this.pets[p].household_id, this.pets[p].id));
				}
				Promise.all(promiseArray).then((values) => {
					for (let p = 0; p < this.pets.length; p++) {
						if (values[p] === undefined) {
							return reject(new Error(`getting report data for pet '${this.pets[p].name}' failed.`));
						} else {
							if (this.report[p] !== undefined) {
								this.reportPrev[p] = JSON.parse(JSON.stringify(this.report[p]));
							}
							this.report[p] = values[p];
						}
					}
					this.lastReportUpdate = Date.now();
					this.updateReport = true;
					return resolve();
				}).catch(err => {
					return reject(err);
				});
			} else {
				return resolve();
			}
		}));
	}

	/*******************************************************************
	 * methods to get information from the response of the surepet API *
	 *******************************************************************/

	/**
	 * update devices with the received data
	 *
	 * @return {Promise}
	 */
	updateDevices() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.setGlobalOnlineStatusToAdapter();
			this.setOfflineDevicesToAdapter();

			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				const prefix = this.households[h].name;

				for (let d = 0; d < this.devices[hid].length; d++) {
					if (this.hasParentDevice(this.devices[hid][d])) {
						const hierarchy = '.' + this.getParentDeviceName(this.devices[hid][d]);

						if ([DEVICE_TYPE_PET_FLAP, DEVICE_TYPE_CAT_FLAP].includes(this.devices[hid][d].product_id)) {
							// Sureflap Connect
							this.setSureflapConnectToAdapter(prefix, hierarchy, hid, d, this.devices[hid][d].product_id === DEVICE_TYPE_CAT_FLAP);
						} else if (this.devices[hid][d].product_id === DEVICE_TYPE_FEEDER) {
							// Feeder Connect
							this.setFeederConnectToAdapter(prefix, hierarchy, hid, d);
						} else if (this.devices[hid][d].product_id === DEVICE_TYPE_WATER_DISPENSER) {
							// water dispenser
							this.setWaterDispenserConnectToAdapter(prefix, hierarchy, hid, d);
						}
						this.setBatteryStatusToAdapter(prefix, hierarchy, hid, d);
						this.setSerialNumberToAdapter(prefix, hierarchy, hid, d);
						this.setSignalStrengthToAdapter(prefix, hierarchy, hid, d);
					} else {
						this.setHubStatusToAdapter(prefix, hid, d);
					}
					this.setVersionsToAdapter(prefix, hid, d);
					this.setOnlineStatusToAdapter(prefix, hid, d);
				}
			}
			return resolve();
		}));
	}

	/**
	 * update pets with received data
	 *
	 * @return {Promise}
	 */
	updatePets() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const numPets = this.pets.length;

			for (let p = 0; p < numPets; p++) {
				if (this.pets[p].name !== undefined) {
					const petName = this.pets[p].name;
					const householdName = this.getHouseholdNameForId(this.pets[p].household_id);
					if (householdName !== undefined) {
						const prefix = householdName + '.pets';
						if (this.hasFlap) {
							this.setPetNameAndPositionToAdapter(prefix, petName, p);
							// add time spent outside and number of entries
							if (this.updateReport) {
								this.setPetOutsideToAdapter(prefix + '.' + petName + '.movement', p);
							}
							// add last used flap and direction
							if (this.updateHistory) {
								this.setPetLastMovementToAdapter(prefix, p, petName, this.pets[p].household_id);
							}
						} else {
							this.setPetNameToAdapter(prefix, petName, p);
						}
						if (this.hasFeeder && this.updateReport) {
							this.setPetFeedingToAdapter(prefix + '.' + petName + '.food', p);
						}
						if (this.hasDispenser && this.updateReport) {
							this.setPetDrinkingToAdapter(prefix + '.' + petName + '.water', p);
						}
					} else {
						if (!this.warnings[PET_HOUSEHOLD_MISSING][p]) {
							this.log.warn(`could not get household for pet (${petName})`);
							this.warnings[PET_HOUSEHOLD_MISSING][p] = true;
						}
					}
				} else {
					if (!this.warnings[PET_NAME_MISSING][p]) {
						this.log.warn(`no name found for pet with id '${this.pets[p].id}'.`);
						this.warnings[PET_NAME_MISSING][p] = true;
					}
				}
			}
			if (this.config.unknown_movement_enable && this.updateHistory) {
				this.setUnknownPetLastMovementToAdapter();
			}
			return resolve();
		}));
	}

	/**
	 * updates event history with received data
	 *
	 * @return {Promise}
	 */
	updateEventHistory() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			if (this.updateHistory) {
				if (this.config.history_enable) {
					for (let h = 0; h < this.households.length; h++) {
						const hid = this.households[h].id;
						const prefix = this.households[h].name;

						if (this.historyPrev[hid] === undefined || JSON.stringify(this.history[hid]) !== JSON.stringify(this.historyPrev[hid])) {
							this.log.debug(`updating event history for household '${prefix}'`);
							/* structure of history changes, so we need to delete and recreate history event structure on change */
							this.deleteEventHistoryForHousehold(h, hid, false).then(() => {
								if (Array.isArray(this.history[hid])) {
									const historyEntries = Math.min(this.history[hid].length, this.config.history_entries);
									this.log.debug(`updating event history with ${historyEntries} events`);
									for (let i = 0; i < historyEntries; i++) {
										this.setHistoryEventToAdapter(prefix, hid, i);
									}
								}
							}).catch(err => {
								this.log.error(`updating event history failed (${err})`);
							});
						}
					}
				}
				if (this.config.history_json_enable) {
					for (let h = 0; h < this.households.length; h++) {
						const hid = this.households[h].id;
						const prefix = this.households[h].name;

						if (this.historyPrev[hid] === undefined || JSON.stringify(this.history[hid]) !== JSON.stringify(this.historyPrev[hid])) {
							this.log.debug(`updating json event history for household '${prefix}'`);
							/* structure of history changes, so we need to delete and recreate history event structure on change */
							if (Array.isArray(this.history[hid])) {
								const historyEntries = Math.min(this.history[hid].length, this.config.history_json_entries);
								this.log.debug(`updating json event history with ${historyEntries} events`);
								for (let i = 0; i < historyEntries; i++) {
									this.setState(prefix + '.history.json.' + i, JSON.stringify(this.history[hid][i]), true);
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
	 * changes the LED mode of the hub (off = 0, high = 1, dimmed = 4)
	 *
	 * @param {string} hierarchy
	 * @param {string} hubName
	 * @param {number} value
	 */
	changeHubLedMode(hierarchy, hubName, value) {
		const deviceId = this.getDeviceId(hubName, [DEVICE_TYPE_HUB]);
		if (deviceId === -1) {
			this.log.warn(`could not find device Id for hub: '${hubName}'`);
			this.resetHubLedModeToAdapter(hierarchy, hubName);
			return;
		}
		if (value !== 0 && value !== 1 && value !== 4) {
			this.log.warn(`invalid value for led mode: '${value}'`);
			this.resetHubLedModeToAdapter(hierarchy, hubName);
			return;
		}

		this.log.debug(`changing hub led mode for hub '${hubName}' to '${value}' ...`);
		this.api.setLedModeForHub(this.authToken, deviceId, value).then(() => {
			this.log.info(`hub led mode for hub '${hubName}' changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing hub led mode for hub '${hubName}' to '${value}' failed: ${err}`);
			this.resetHubLedModeToAdapter(hierarchy, hubName);
		});
	}

	/**
	 * changes the close delay of a feeder (fast = 0, normal = 4, slow = 20)
	 *
	 * @param {string} hierarchy
	 * @param {string} feederName
	 * @param {number} value
	 */
	changeFeederCloseDelay(hierarchy, feederName, value) {
		const deviceId = this.getDeviceId(feederName, [DEVICE_TYPE_FEEDER]);
		if (deviceId === -1) {
			this.log.warn(`could not find device Id for feeder: '${feederName}'`);
			this.resetFeederCloseDelayToAdapter(hierarchy, feederName);
			return;
		}
		if (value !== 0 && value !== 4 && value !== 20) {
			this.log.warn(`invalid value for close delay: '${value}'`);
			this.resetFeederCloseDelayToAdapter(hierarchy, feederName);
			return;
		}

		this.log.debug(`changing close delay for feeder '${feederName}' to '${value}' ...`);
		this.api.setCloseDelayForFeeder(this.authToken, deviceId, value).then(() => {
			this.log.info(`close delay for feeder '${feederName}' changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing close delay for feeder '${feederName}' to '${value}' failed: ${err}`);
			this.resetFeederCloseDelayToAdapter(hierarchy, feederName);
		});
	}

	/**
	 * changes the pet type for an assigned pet of a flap (outdoor pet = 2, indoor pet = 3)
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 * @param {string} petName
	 * @param {number} petTagId
	 * @param {number} value
	 */
	changeFlapPetType(hierarchy, flapName, petName, petTagId, value) {
		const deviceId = this.getDeviceId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (deviceId === -1) {
			this.log.warn(`could not find device Id for flap: '${flapName}'`);
			this.resetFlapPetTypeToAdapter(hierarchy, flapName, petName, petTagId);
			return;
		}
		if (value < 2 || value > 3) {
			this.log.warn(`invalid value for pet type: '${value}'`);
			this.resetFlapPetTypeToAdapter(hierarchy, flapName, petName, petTagId);
			return;
		}

		this.log.debug(`changing pet type of pet '${petName}' for flap '${flapName}' to '${value}' ...`);
		this.api.setPetTypeForFlapAndPet(this.authToken, deviceId, petTagId, value).then(() => {
			this.log.info(`pet type of pet '${petName}' for flap '${flapName}' changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing pet type of pet '${petName}' for flap '${flapName}' to '${value}' failed: ${err}`);
			this.resetFlapPetTypeToAdapter(hierarchy, flapName, petName, petTagId);
		});
	}

	/**
	 * changes the lockmode of a flap (open = 0, locked in = 1, locked out = 2, locked both = 3)
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 * @param {number} value
	 */
	changeFlapLockMode(hierarchy, flapName, value) {
		const deviceId = this.getDeviceId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (deviceId === -1) {
			this.log.warn(`could not find device Id for flap: '${flapName}'`);
			this.resetFlapLockModeToAdapter(hierarchy, flapName);
			return;
		}
		if (value < 0 || value > 3) {
			this.log.warn(`invalid value for lock mode: '${value}'`);
			this.resetFlapLockModeToAdapter(hierarchy, flapName);
			return;
		}

		this.log.debug(`changing lock mode for flap '${flapName}' to '${value}' ...`);
		this.api.setLockModeForFlap(this.authToken, deviceId, value).then(() => {
			this.log.info(`lock mode for flap '${flapName}' changed to '${value}'`);
		}).catch(err => {
			this.log.error(`changing lock mode for flap '${flapName}' to '${value}' failed: ${err}`);
			this.resetFlapLockModeToAdapter(hierarchy, flapName);
		});
	}

	/**
	 * changes the location of a pet (inside = true, outside = false)
	 *
	 * @param {string} hierarchy
	 * @param {string} petName
	 * @param {boolean} value
	 */
	changePetLocation(hierarchy, petName, value) {
		const petId = this.getPetId(petName);
		if (petId === -1) {
			this.log.warn(`could not find pet Id for pet: '${petName}'`);
			this.resetPetLocationToAdapter(hierarchy, petName);
			return;
		}

		this.log.debug(`changing location of pet '${petName}' to '${value ? 'inside' : 'outside'}' ...`);
		this.api.setLocationForPet(this.authToken, petId, value ? 1 : 2).then(() => {
			this.log.info(`location for pet '${petName}' changed to '${value ? 'inside' : 'outside'}'`);
		}).catch(error => {
			this.log.error(`changing location for pet '${petName}' to '${value ? 'inside' : 'outside'}' failed: ${error}`);
			this.resetPetLocationToAdapter(hierarchy, petName);
		});
	}

	/**
	 * changes the assigment of a pet for a device (assigned = true, unassigned = false)
	 *
	 * @param {string} hierarchy
	 * @param {string} deviceName
	 * @param {string} petName
	 * @param {boolean} value
	 */
	changePetAssigment(hierarchy, deviceName, petName, value) {
		const petTagId = this.getPetTagId(petName);
		const deviceId = this.getDeviceId(deviceName, []);
		if (petTagId === -1) {
			this.log.warn(`could not find pet tag Id for pet: '${petName}'`);
			this.resetPetAssigmentToAdapter(hierarchy, deviceName, petName);
			return;
		} else if (deviceId === -1) {
			this.log.warn(`could not find device Id for pet: '${deviceName}'`);
			this.resetPetAssigmentToAdapter(hierarchy, deviceName, petName);
			return;
		}

		this.log.debug(`changing assigment of pet '${petName}' for '${deviceName}' to '${value ? 'assigned' : 'unassigned'}' ...`);
		this.api.setPetAssignmentForDevice(this.authToken, deviceId, petTagId, value).then(() => {
			this.log.info(`assigment of pet '${petName}' for '${deviceName}' changed to '${value ? 'assigned' : 'unassigned'}'`);
		}).catch(error => {
			this.log.error(`changing assigment of pet '${petName}' for '${deviceName}' to '${value ? 'assigned' : 'unassigned'}' failed: ${error}`);
			this.resetPetAssigmentToAdapter(hierarchy, deviceName, petName);
		});
	}

	/**
	 * switches the curfew for a flap on or off
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 * @param {boolean} value
	 */
	changeCurfewEnabled(hierarchy, flapName, value) {
		let currentState = false;
		const objNameCurrentCurfew = hierarchy + '.control' + '.current_curfew';
		const deviceType = this.getDeviceTypeByDeviceName(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		const deviceId = this.getDeviceId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (deviceId === -1) {
			this.log.warn(`could not find device Id for flap: '${flapName}'`);
			this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
			return;
		}

		this.getCurfewFromAdapter(objNameCurrentCurfew).then(curfew => {
			currentState = this.isCurfewEnabled(curfew);
		}).finally(() => {
			this.log.debug(`control curfew old state: ${currentState} new state: ${value}`);
			if (currentState !== value) {
				if (value === true) {
					// enable curfew
					const objNameLastCurfew = hierarchy + '.last_enabled_curfew';
					this.getCurfewFromAdapter(objNameLastCurfew).then(curfew => {
						if (curfew.length > 0) {
							this.log.debug(`setting curfew to: '${JSON.stringify(curfew)}' ...`);
							curfew = this.convertCurfewLocalTimesToUtcTimes(curfew);
							if (DEVICE_TYPE_PET_FLAP === deviceType) {
								// pet flap takes single object instead of array
								curfew = curfew[0];
								curfew.enabled = true;
							}
							this.api.setCurfewForFlap(this.authToken, deviceId, curfew).then(() => {
								this.log.info(`curfew successfully enabled`);
							}).catch(err => {
								this.log.error(`could not enable curfew because: ${err}`);
								this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
							});
						} else {
							this.log.error(`could not enable curfew because: last_enabled_curfew does not contain a curfew`);
							this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
						}
					}).catch(err => {
						this.log.error(`could not enable curfew because: ${err}`);
						this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
					});
				} else {
					// disable curfew
					const objName = hierarchy + '.control' + '.current_curfew';
					this.getCurfewFromAdapter(objName).then(curfew => {
						for (let h = 0; h < curfew.length; h++) {
							curfew[h].enabled = false;
						}
						this.log.debug('setting curfew to: ' + JSON.stringify(curfew));
						curfew = this.convertCurfewLocalTimesToUtcTimes(curfew);
						if (DEVICE_TYPE_PET_FLAP === deviceType) {
							// pet flap takes single object instead of array
							curfew = curfew[0];
						}
						this.api.setCurfewForFlap(this.authToken, deviceId, curfew).then(() => {
							this.log.info(`curfew successfully disabled`);
						}).catch(err => {
							this.log.error(`could not disable curfew because: ${err}`);
							this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
						});
					}).catch(err => {
						this.log.error(`could not disable curfew because: ${err}`);
						this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
					});
				}
			}
		});
	}

	/**
	 * changes the current curfew for a flap
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 * @param {string} value
	 */
	changeCurrentCurfew(hierarchy, flapName, value) {
		const deviceType = this.getDeviceTypeByDeviceName(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		const deviceId = this.getDeviceId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (deviceId === -1) {
			this.log.warn(`could not find device Id for flap: '${flapName}'`);
			this.resetFlapCurfewEnabledToAdapter(hierarchy, flapName);
			return;
		}

		let curfew = this.validateAndGetCurfewFromJsonString(value, deviceType);
		if (curfew === undefined) {
			this.log.error(`could not update curfew because of previous error`);
			this.resetControlCurrentCurfewToAdapter(hierarchy, flapName);
		} else {
			this.log.debug(`changing curfew to: '${JSON.stringify(curfew)}' ...`);
			curfew = this.convertCurfewLocalTimesToUtcTimes(curfew);
			if (DEVICE_TYPE_PET_FLAP === deviceType) {
				// pet flap takes single object instead of array
				curfew = curfew[0];
			}
			this.api.setCurfewForFlap(this.authToken, deviceId, curfew).then(() => {
				this.log.info(`curfew successfully updated`);
			}).catch(err => {
				this.log.error(`could not update curfew because: ${err}`);
				this.resetControlCurrentCurfewToAdapter(hierarchy, flapName);
			});
		}
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
					this.setAdapterVersionToAdapter(ADAPTER_VERSION);
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
	setAdapterVersionToAdapter(version) {
		this.log.silly(`setting adapter version to adapter`);

		/* objects created via io-package.json, no need to create them here */
		this.setState('info.version', version, true);
	}

	/**
	 * sets connection status to the adapter
	 *
	 * @param {boolean} connected
	 */
	setConnectionStatusToAdapter(connected) {
		this.log.silly(`setting connection status to adapter`);

		/* objects created via io-package.json, no need to create them here	*/
		this.setState('info.connection', connected, true);
	}

	/**
	 * sets global online status to the adapter
	 */
	setGlobalOnlineStatusToAdapter() {
		this.log.silly(`setting global online status to adapter`);

		if (this.allDevicesOnline !== this.allDevicesOnlinePrev) {
			const objName = 'info.all_devices_online';
			this.setState(objName, this.allDevicesOnline, true);
		}
	}

	/**
	 * sets offline devices to the adapter
	 */
	setOfflineDevicesToAdapter() {
		this.log.silly(`setting offline devices to adapter`);

		if (JSON.stringify(this.offlineDevices) !== JSON.stringify(this.offlineDevicesPrev)) {
			const objName = 'info.offline_devices';
			this.setState(objName, this.offlineDevices.join(','), true);
		}
	}

	/**
	 * sets the last time data was received from surepet api
	 */
	setLastUpdateToAdapter() {
		this.log.silly(`setting last update to adapter`);

		/* object created via io-package.json, no need to create them here */
		this.setState('info.last_update', this.getCurrentDateFormattedAsISO(), true);
	}


	/**
	 * sets sureflap attributes to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {boolean} isCatFlap
	 */
	setSureflapConnectToAdapter(prefix, hierarchy, hid, deviceIndex, isCatFlap) {
		// lock mode
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'status.locking.mode')) {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.locking.mode') || (this.devices[hid][deviceIndex].status.locking.mode !== this.devicesPrev[hid][deviceIndex].status.locking.mode)) {
				const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.control' + '.lockmode';
				try {
					this.setState(objName, this.devices[hid][deviceIndex].status.locking.mode, true);
				} catch (error) {
					this.log.error(`could not set lock mode to adapter (${error})`);
				}
			}
			this.warnings[FLAP_LOCK_MODE_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FLAP_LOCK_MODE_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no lock mode data found for flap '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[FLAP_LOCK_MODE_DATA_MISSING][deviceIndex] = true;
			}
		}

		// curfew
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'control.curfew')) {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'control.curfew') || (JSON.stringify(this.devices[hid][deviceIndex].control.curfew) !== JSON.stringify(this.devicesPrev[hid][deviceIndex].control.curfew))) {
				if (this.devicesPrev[hid] && this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'control.curfew') && this.isCurfewEnabled(this.devicesPrev[hid][deviceIndex].control.curfew)) {
					const objNameLastEnabledCurfew = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.last_enabled_curfew';
					this.setCurfewToAdapter(objNameLastEnabledCurfew, this.devicesPrev[hid][deviceIndex].control.curfew);
				}

				const objNameCurrentCurfew = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.control' + '.current_curfew';
				this.setCurfewToAdapter(objNameCurrentCurfew, this.devices[hid][deviceIndex].control.curfew);

				const objNameCurfewEnabled = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.control' + '.curfew_enabled';
				try {
					this.setState(objNameCurfewEnabled, this.isCurfewEnabled(this.devices[hid][deviceIndex].control.curfew), true);
				} catch (error) {
					this.log.error(`could not set curfew to adapter (${error})`);
				}
			}

			// curfew active
			this.curfewActive = this.isCurfewActive(this.devices[hid][deviceIndex].control.curfew);
			if (this.curfewActivePrev === undefined || this.curfewActive !== this.curfewActivePrev) {
				this.setState(prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.curfew_active', this.curfewActive, true);
				this.log.info(`changing curfew_active from ${this.curfewActivePrev} to ${this.curfewActive}`);
				this.curfewActivePrev = this.curfewActive;
			}

			this.warnings[FLAP_CURFEW_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FLAP_CURFEW_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no curfew data found for flap '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[FLAP_CURFEW_DATA_MISSING][deviceIndex] = true;
			}
		}

		// pets assigned status
		for (let p = 0; p < this.pets.length; p++) {
			const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.control.pets.';
			this.setPetAssignedStatusToAdapter(hid, deviceIndex, objName, this.pets[p]);
		}

		if (isCatFlap) {
			// assigned pets type
			if (this.objectContainsPath(this.devices[hid][deviceIndex], 'tags') && Array.isArray(this.devices[hid][deviceIndex].tags)) {
				// update type for all assigned pets
				for (let t = 0; t < this.devices[hid][deviceIndex].tags.length; t++) {
					const name = this.getPetNameForTagId(this.devices[hid][deviceIndex].tags[t].id);
					if (name !== undefined) {
						const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.control.pets.' + name + '.type';
						if (this.hasPetAssignedChanged(hid, deviceIndex, this.devices[hid][deviceIndex].tags[t].id)) {
							// create type status first
							this.setObjectNotExists(objName, this.buildStateObject('pet type', 'switch.mode.type', 'number', false, {
								2: 'OUTDOOR PET',
								3: 'INDOOR PET'
							}), () => {
								try {
									this.setState(objName, this.devices[hid][deviceIndex].tags[t].profile, true);
								} catch (error) {
									this.log.error(`could not set pet type to adapter (${error})`);
								}
							});
						} else {
							if (!this.devicesPrev[hid] || !this.devicesPrev[hid][deviceIndex].tags[t] || !this.devicesPrev[hid][deviceIndex].tags[t].profile || (this.devices[hid][deviceIndex].tags[t].profile !== this.devicesPrev[hid][deviceIndex].tags[t].profile)) {
								try {
									this.setState(objName, this.devices[hid][deviceIndex].tags[t].profile, true);
								} catch (error) {
									this.log.error(`could not set pet type to adapter (${error})`);
								}
							}
						}
					} else {
						this.log.warn(`could not find pet with pet tag id (${this.devices[hid][deviceIndex].tags[t].id})`);
						this.log.debug(`cat flap '${this.devices[hid][deviceIndex].name}' has ${this.devices[hid][deviceIndex].tags.length} pets assigned and household has ${this.pets.length} pets assigned.`);
					}
				}

				// remove type for all unassigned pets
				for (let p = 0; p < this.pets.length; p++) {
					if (this.hasPetAssignedChanged(hid, deviceIndex, this.pets[p].tag_id) && !this.doesTagsArrayContainTagId(this.devices[hid][deviceIndex].tags, this.pets[p].tag_id)) {
						const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.control.pets.' + this.pets[p].name + '.type';
						this.deleteObjectFormAdapterIfExists(objName, false);
					}
				}

				this.warnings[CAT_FLAP_PET_TYPE_DATA_MISSING][deviceIndex] = false;
			} else {
				if (!this.warnings[CAT_FLAP_PET_TYPE_DATA_MISSING][deviceIndex]) {
					this.log.warn(`no pet type data found for cat flap '${this.devices[hid][deviceIndex].name}'.`);
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
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setFeederConnectToAdapter(prefix, hierarchy, hid, deviceIndex) {
		const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name;

		// close delay
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'control.lid.close_delay')) {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'control.lid.close_delay') || (this.devices[hid][deviceIndex].control.lid.close_delay !== this.devicesPrev[hid][deviceIndex].control.lid.close_delay)) {
				this.setState(objName + '.control' + '.close_delay', this.devices[hid][deviceIndex].control.lid.close_delay, true);
				this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex] = false;
			}
			this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no close delay setting found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[FEEDER_CLOSE_DELAY_DATA_MISSING][deviceIndex] = true;
			}
		}

		// pets assigned status
		for (let p = 0; p < this.pets.length; p++) {
			this.setPetAssignedStatusToAdapter(hid, deviceIndex, objName + '.control.pets.', this.pets[p]);
		}

		// feeder config
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'control.bowls.settings') && Array.isArray(this.devices[hid][deviceIndex].control.bowls.settings)) {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'control.bowls.settings') || (JSON.stringify(this.devices[hid][deviceIndex].control.bowls.settings) !== JSON.stringify(this.devicesPrev[hid][deviceIndex].control.bowls.settings))) {
				for (let b = 0; b < this.devices[hid][deviceIndex].control.bowls.settings.length; b++) {
					this.getObject(objName + '.bowls.' + b, (err, obj) => {
						if (!err && obj) {
							if (this.objectContainsPath(this.devices[hid][deviceIndex].control.bowls.settings[b], 'food_type')) {
								this.setState(objName + '.bowls.' + b + '.food_type', this.devices[hid][deviceIndex].control.bowls.settings[b].food_type, true);
							}
							if (this.objectContainsPath(this.devices[hid][deviceIndex].control.bowls.settings[b], 'target')) {
								this.setState(objName + '.bowls.' + b + '.target', this.devices[hid][deviceIndex].control.bowls.settings[b].target, true);
							}
							this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
						} else {
							if (!this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING][deviceIndex]) {
								this.log.warn(`got feeder config data for object '${objName + '.bowls.' + b}' but object does not exist. This can happen if number of bowls is changed and can be ignored.`);
								this.warnings[FEEDER_BOWL_CONFIG_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
							}
						}
					});
				}
			}
			this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING][deviceIndex] = false;
		} else {
			if (!this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no feeder config data found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[FEEDER_BOWL_CONFIG_DATA_MISSING][deviceIndex] = true;
			}
		}

		// feeder remaining food data
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'status.bowl_status') && Array.isArray(this.devices[hid][deviceIndex].status.bowl_status)) {
			// get feeder remaining food data from new bowl_status
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.bowl_status') || (JSON.stringify(this.devices[hid][deviceIndex].status.bowl_status) !== JSON.stringify(this.devicesPrev[hid][deviceIndex].status.bowl_status))) {
				this.log.silly(`Updating remaining food data from bowl_status.`);
				const bowlCount = this.objectContainsPath(this.devices[hid][deviceIndex], 'control.bowls.type') && this.devices[hid][deviceIndex].control.bowls.type === FEEDER_SINGLE_BOWL ? 1 : this.devices[hid][deviceIndex].status.bowl_status.length;
				for (let b = 0; b < bowlCount; b++) {
					this.getObject(objName + '.bowls.' + b, (err, obj) => {
						if (!err && obj) {
							if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[b], 'current_weight')) {
								this.setState(objName + '.bowls.' + b + '.weight', this.devices[hid][deviceIndex].status.bowl_status[b].current_weight, true);
							}
							if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[b], 'fill_percent')) {
								this.setState(objName + '.bowls.' + b + '.fill_percent', this.devices[hid][deviceIndex].status.bowl_status[b].fill_percent, true);
							}
							if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[b], 'last_filled_at')) {
								this.setState(objName + '.bowls.' + b + '.last_filled_at', this.devices[hid][deviceIndex].status.bowl_status[b].last_filled_at, true);
							}
							if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[b], 'last_zeroed_at')) {
								this.setState(objName + '.bowls.' + b + '.last_zeroed_at', this.devices[hid][deviceIndex].status.bowl_status[b].last_zeroed_at, true);
							}
							this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
						} else {
							if (!this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex]) {
								this.log.warn(`got feeder status data for object '${objName + '.bowls.' + b}' but object does not exist. This can happen if number of bowls is changed and can be ignored.`);
								this.warnings[FEEDER_BOWL_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
							}
						}
					});

				}
			}
		} else {
			// get feeder remaining food data from sureFlapReport
			if (this.updateReport && (this.reportPrev === undefined || this.reportPrev.length === 0 || JSON.stringify(this.report) !== JSON.stringify(this.reportPrev))) {
				const deviceId = this.devices[hid][deviceIndex].id;
				let lastDatapoint = undefined;
				// look in feeding data for every pet
				for (let p = 0; p < this.pets.length; p++) {
					// look in feeding data points starting with latest (last)
					if (this.objectContainsPath(this.report[p], 'feeding.datapoints') && Array.isArray(this.report[p].feeding.datapoints)) {
						for (let i = this.report[p].feeding.datapoints.length - 1; i >= 0; i--) {
							// check if datapoint is for this feeder
							if (this.report[p].feeding.datapoints[i].device_id === deviceId) {
								// check if datapoint is newer than saved datapoint
								if (lastDatapoint === undefined || lastDatapoint.to === undefined || new Date(lastDatapoint.to) < new Date(this.report[p].feeding.datapoints[i].to)) {
									lastDatapoint = this.report[p].feeding.datapoints[i];
									break;
								}
							}
						}
					}
				}
				// if datapoint with food data found for this device, write it to adapter
				if (lastDatapoint !== undefined) {
					this.log.silly(`Updating remaining food data from sureFlapReport.`);

					for (let b = 0; b < (this.objectContainsPath(lastDatapoint, 'bowl_count') ? lastDatapoint.bowl_count : lastDatapoint.weights.length); b++) {
						this.getObject(objName + '.bowls.' + lastDatapoint.weights[b].index, (err, obj) => {
							if (!err && obj) {
								this.getState(objName + '.bowls.' + lastDatapoint.weights[b].index + '.weight', (err, obj) => {
									if (!err && obj) {
										if (obj.val !== lastDatapoint.weights[b].weight) {
											this.log.debug(`updating remaining food for feeder '${this.devices[hid][deviceIndex].name}' bowl '${lastDatapoint.weights[b].index}' with '${lastDatapoint.weights[b].weight}'.`);
											this.setState(objName + '.bowls.' + lastDatapoint.weights[b].index + '.weight', lastDatapoint.weights[b].weight, true);
										}
										this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
									} else if (!err && obj == null) {
										this.log.debug(`setting remaining food for feeder '${this.devices[hid][deviceIndex].name}' bowl '${lastDatapoint.weights[b].index}' with '${lastDatapoint.weights[b].weight}'.`);
										this.setState(objName + '.bowls.' + lastDatapoint.weights[b].index + '.weight', lastDatapoint.weights[b].weight, true);
										this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
									} else {
										if (!this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex]) {
											this.log.warn(`got feeder remaining food data for object '${objName}.bowls.${lastDatapoint.weights[b].index}.weight' (${b}) but object does not exist. This can happen if number of bowls is changed and can be ignored.`);
											this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
										}
									}
								});
							} else {
								if (!this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex]) {
									this.log.warn(`got feeder remaining food data for object '${objName}.bowls.${lastDatapoint.weights[b].index}' (${b}) but object does not exist. This can happen if number of bowls is changed and can be ignored.`);
									this.warnings[FEEDER_BOWL_REMAINING_FOOD_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
								}
							}
						});
					}
					this.warnings[FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING][deviceIndex] = false;
				} else {
					if (!this.warnings[FEEDER_BOWL_REMAINING_FOOD_DATA_MISSING][deviceIndex]) {
						this.log.warn(`no remaining food data for feeder '${this.devices[hid][deviceIndex].name}' found`);
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
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setWaterDispenserConnectToAdapter(prefix, hierarchy, hid, deviceIndex) {
		const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name;

		// pets assigned status
		for (let p = 0; p < this.pets.length; p++) {
			this.setPetAssignedStatusToAdapter(hid, deviceIndex, objName + '.control.pets.', this.pets[p]);
		}

		// water dispenser remaining water data
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'status.bowl_status') && Array.isArray(this.devices[hid][deviceIndex].status.bowl_status)) {
			// get feeder remaining food data from new bowl_status
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.bowl_status') || (JSON.stringify(this.devices[hid][deviceIndex].status.bowl_status) !== JSON.stringify(this.devicesPrev[hid][deviceIndex].status.bowl_status))) {
				this.log.silly(`Updating remaining water data from bowl_status.`);
				this.getObject(objName + '.water', (err, obj) => {
					if (!err && obj) {
						if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[0], 'current_weight')) {
							this.setState(objName + '.water' + '.weight', this.devices[hid][deviceIndex].status.bowl_status[0].current_weight, true);
						}
						if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[0], 'fill_percent')) {
							this.setState(objName + '.water' + '.fill_percent', this.devices[hid][deviceIndex].status.bowl_status[0].fill_percent, true);
						}
						if (this.objectContainsPath(this.devices[hid][deviceIndex].status.bowl_status[0], 'last_filled_at')) {
							this.setState(objName + '.water' + '.last_filled_at', this.devices[hid][deviceIndex].status.bowl_status[0].last_filled_at, true);
						}
						this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
					} else {
						if (!this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex]) {
							this.log.warn(`got remaining water data for object '${objName}.water' but object does not exist. This can happen if you newly added a water dispenser. In this case restart the adapter. If you did not add a water dispenser or if a restart does not help, contact developer.`);
							this.warnings[DISPENSER_WATER_STATUS_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
						}
					}
				});
			}
		} else {
			// water dispenser remaining water data from sureFlapReport
			if (this.updateReport && (this.reportPrev === undefined || this.reportPrev.length === 0 || JSON.stringify(this.report) !== JSON.stringify(this.reportPrev))) {
				const deviceId = this.devices[hid][deviceIndex].id;
				let lastDatapoint = undefined;
				// look in drinking data for every pet
				for (let p = 0; p < this.pets.length; p++) {
					// look in drinking data points starting with latest (last)
					if (this.objectContainsPath(this.report[p], 'drinking.datapoints') && Array.isArray(this.report[p].drinking.datapoints)) {
						for (let i = this.report[p].drinking.datapoints.length - 1; i >= 0; i--) {
							// check if datapoint is for this water dispenser
							if (this.report[p].drinking.datapoints[i].device_id === deviceId) {
								// check if datapoint is newer than saved datapoint
								if (lastDatapoint === undefined || lastDatapoint.to === undefined || new Date(lastDatapoint.to) < new Date(this.report[p].drinking.datapoints[i].to)) {
									lastDatapoint = this.report[p].drinking.datapoints[i];
									break;
								}
							}
						}
					}
				}
				// if datapoint with drinking data found for this device, write it to adapter
				if (lastDatapoint !== undefined && lastDatapoint.weights !== undefined && Array.isArray(lastDatapoint.weights) && lastDatapoint.weights.length > 0) {
					this.log.silly(`Updating remaining water data from sureFlapReport.`);
					this.getObject(objName + '.water', (err, obj) => {
						if (!err && obj) {
							this.getState(objName + '.water.weight', (err, obj) => {
								if (!err && obj) {
									if (obj.val !== lastDatapoint.weights[0].weight) {
										this.log.debug(`updating remaining water for water dispenser '${this.devices[hid][deviceIndex].name}' with '${lastDatapoint.weights[0].weight}'.`);
										this.setState(objName + '.water.weight', lastDatapoint.weights[0].weight, true);
									}
									this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
								} else if (!err && obj == null) {
									this.log.debug(`setting remaining water for water dispenser '${this.devices[hid][deviceIndex].name}' with '${lastDatapoint.weights[0].weight}'.`);
									this.setState(objName + '.water.weight', lastDatapoint.weights[0].weight, true);
									this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = false;
								} else {
									if (!this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex]) {
										this.log.warn(`got remaining water data for object '${objName}.water' but object does not exist. This can happen if you newly added a water dispenser. In this case restart the adapter. If you did not add a water dispenser or if a restart does not help, contact developer.`);
										this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
									}
								}
							});
						} else {
							if (!this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex]) {
								this.log.warn(`got remaining water data for object '${objName}.water' but object does not exist. This can happen if you newly added a water dispenser. In this case restart the adapter. If you did not add a water dispenser or if a restart does not help, contact developer.`);
								this.warnings[DISPENSER_WATER_REMAINING_ADAPTER_OBJECT_MISSING][deviceIndex] = true;
							}
						}
					});
					this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING][deviceIndex] = false;
				} else {
					if (!this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING][deviceIndex]) {
						this.log.warn(`no remaining water data for water dispenser '${this.devices[hid][deviceIndex].name}' found`);
						this.warnings[DISPENSER_WATER_REMAINING_DATA_MISSING][deviceIndex] = true;
					}
				}
			}
		}
	}

	/**
	 * Sets the assigned status of a pet for the given device.
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {string} objName
	 * @param {object} pet
	 */
	setPetAssignedStatusToAdapter(hid, deviceIndex, objName, pet) {
		if (pet !== undefined && pet.name !== undefined && pet.tag_id !== undefined) {
			if (this.objectContainsPath(this.devices[hid][deviceIndex], 'tags') && this.doesTagsArrayContainTagId(this.devices[hid][deviceIndex].tags, pet.tag_id)) {
				if (!this.devicesPrev[hid] || !this.devicesPrev[hid][deviceIndex] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'tags') || !this.doesTagsArrayContainTagId(this.devicesPrev[hid][deviceIndex].tags, pet.tag_id)) {
					this.setState(objName + pet.name + '.assigned', true, true);
				}
			} else if (!this.devicesPrev[hid] || !this.devicesPrev[hid][deviceIndex] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'tags') || this.doesTagsArrayContainTagId(this.devicesPrev[hid][deviceIndex].tags, pet.tag_id)) {
				this.setState(objName + pet.name + '.assigned', false, true);
			}
		}
	}

	/**
	 * Returns whether the assigned state of the pet for the device has changed.
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {number} tagId of a pet
	 */
	hasPetAssignedChanged(hid, deviceIndex, tagId) {
		if (this.objectContainsPath(this.devices[hid][deviceIndex], 'tags') && this.devicesPrev && this.devicesPrev[hid] && this.devicesPrev[hid][deviceIndex] && this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'tags')) {
			if (this.doesTagsArrayContainTagId(this.devices[hid][deviceIndex].tags, tagId) !== this.doesTagsArrayContainTagId(this.devicesPrev[hid][deviceIndex].tags, tagId)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * sets curfew of flap to the adapter
	 *
	 * @param {string} objName
	 * @param {object} new_curfew
	 */
	setCurfewToAdapter(objName, new_curfew) {
		this.log.silly(`setting curfew '${JSON.stringify(new_curfew)}' to '${objName}'`);
		this.setState(objName, JSON.stringify(new_curfew), true);
	}

	/**
	 * sets battery status to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setBatteryStatusToAdapter(prefix, hierarchy, hid, deviceIndex) {
		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.battery')) {
			if (!this.warnings[DEVICE_BATTERY_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no battery data found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_BATTERY_DATA_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.battery') || this.devices[hid][deviceIndex].status.battery !== this.devicesPrev[hid][deviceIndex].status.battery) {
				const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.' + 'battery';
				this.setState(objName, this.devices[hid][deviceIndex].status.battery, true);
			}
			this.warnings[DEVICE_BATTERY_DATA_MISSING][deviceIndex] = false;
		}

		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.battery_percentage')) {
			if (!this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING][deviceIndex]) {
				this.log.warn(`no battery percentage data found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.battery_percentage') || this.devices[hid][deviceIndex].status.battery_percentage !== this.devicesPrev[hid][deviceIndex].status.battery_percentage) {
				const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.' + 'battery_percentage';
				this.setState(objName, this.devices[hid][deviceIndex].status.battery_percentage, true);
			}
			this.warnings[DEVICE_BATTERY_PERCENTAGE_DATA_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets the serial number to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setSerialNumberToAdapter(prefix, hierarchy, hid, deviceIndex) {
		if (!this.devices[hid][deviceIndex].serial_number) {
			if (!this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no serial number found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.devicesPrev[hid][deviceIndex].serial_number || (this.devices[hid][deviceIndex].serial_number !== this.devicesPrev[hid][deviceIndex].serial_number)) {
				const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.' + 'serial_number';
				this.setState(objName, this.devices[hid][deviceIndex].serial_number, true);
			}
			this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets the signal strength to the adapter
	 *
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setSignalStrengthToAdapter(prefix, hierarchy, hid, deviceIndex) {
		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.signal.device_rssi')) {
			if (!this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex]) {
				this.log.warn(`no device rssi found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.signal.device_rssi') || (this.devices[hid][deviceIndex].status.signal.device_rssi !== this.devicesPrev[hid][deviceIndex].status.signal.device_rssi)) {
				const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.signal' + '.device_rssi';
				this.setState(objName, this.devices[hid][deviceIndex].status.signal.device_rssi, true);
			}
			// API randomly does not return rssi -> do not reset warning until API is fixed or logs will be spammed
			//this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = false;
		}

		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.signal.hub_rssi')) {
			if (!this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex]) {
				this.log.warn(`no hub rssi found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.signal.hub_rssi') || (this.devices[hid][deviceIndex].status.signal.hub_rssi !== this.devicesPrev[hid][deviceIndex].status.signal.hub_rssi)) {
				const objName = prefix + hierarchy + '.' + this.devices[hid][deviceIndex].name + '.signal' + '.hub_rssi';
				this.setState(objName, this.devices[hid][deviceIndex].status.signal.hub_rssi, true);
			}
			// API randomly does not return rssi -> do not reset warning until API is fixed or logs will be spammed
			//this.warnings[DEVICE_SIGNAL_STRENGTH_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets the hardware and software version to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setVersionsToAdapter(prefix, hid, deviceIndex) {
		let hierarchy = prefix;
		if (this.hasParentDevice(this.devices[hid][deviceIndex])) {
			hierarchy = prefix + '.' + this.getParentDeviceName(this.devices[hid][deviceIndex]);
		}

		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.version.device.hardware')) {
			if (!this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no hardware version found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.version.device.hardware') || (this.devices[hid][deviceIndex].status.version.device.hardware !== this.devicesPrev[hid][deviceIndex].status.version.device.hardware)) {
				const objName = hierarchy + '.' + this.devices[hid][deviceIndex].name + '.version' + '.hardware';
				this.setState(objName, this.devices[hid][deviceIndex].status.version.device.hardware, true);
			}
			this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = false;
		}

		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.version.device.firmware')) {
			if (!this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no firmware version found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.version.device.firmware') || (this.devices[hid][deviceIndex].status.version.device.firmware !== this.devicesPrev[hid][deviceIndex].status.version.device.firmware)) {
				const objName = hierarchy + '.' + this.devices[hid][deviceIndex].name + '.version' + '.firmware';
				this.setState(objName, this.devices[hid][deviceIndex].status.version.device.firmware, true);
			}
			this.warnings[DEVICE_VERSION_NUMBER_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets hub status to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setHubStatusToAdapter(prefix, hid, deviceIndex) {
		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.led_mode')) {
			if (!this.warnings[HUB_LED_MODE_MISSING][deviceIndex]) {
				this.log.warn(`no led mode found for hub '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[HUB_LED_MODE_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.led_mode') || (this.devices[hid][deviceIndex].status.led_mode !== this.devicesPrev[hid][deviceIndex].status.led_mode)) {
				const objName = prefix + '.' + this.devices[hid][deviceIndex].name + '.control.' + 'led_mode';
				this.setState(objName, this.devices[hid][deviceIndex].status.led_mode, true);
			}
			this.warnings[HUB_LED_MODE_MISSING][deviceIndex] = false;
		}

		if (!this.devices[hid][deviceIndex].serial_number) {
			if (!this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex]) {
				this.log.warn(`no serial number found for hub '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.devicesPrev[hid][deviceIndex].serial_number || (this.devices[hid][deviceIndex].serial_number !== this.devicesPrev[hid][deviceIndex].serial_number)) {
				const objName = prefix + '.' + this.devices[hid][deviceIndex].name + '.serial_number';
				this.setState(objName, this.devices[hid][deviceIndex].serial_number, true);
			}
			this.warnings[DEVICE_SERIAL_NUMBER_MISSING][deviceIndex] = false;
		}
	}

	/**
	 * sets online status of devices to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 */
	setOnlineStatusToAdapter(prefix, hid, deviceIndex) {
		// online status
		if (!this.objectContainsPath(this.devices[hid][deviceIndex], 'status.online')) {
			if (!this.warnings[DEVICE_ONLINE_STATUS_MISSING][deviceIndex]) {
				this.log.warn(`no online status found for '${this.devices[hid][deviceIndex].name}'.`);
				this.warnings[DEVICE_ONLINE_STATUS_MISSING][deviceIndex] = true;
			}
		} else {
			if (!this.devicesPrev[hid] || !this.objectContainsPath(this.devicesPrev[hid][deviceIndex], 'status.online') || this.devices[hid][deviceIndex].status.online !== this.devicesPrev[hid][deviceIndex].status.online) {
				let objName = prefix + '.' + this.devices[hid][deviceIndex].name + '.' + 'online';
				if (this.hasParentDevice(this.devices[hid][deviceIndex])) {
					objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][deviceIndex]) + '.' + this.devices[hid][deviceIndex].name + '.' + 'online';
				}
				this.setState(objName, this.devices[hid][deviceIndex].status.online, true);
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
		if (!this.petsPrev || !this.petsPrev[petIndex] || !this.petsPrev[petIndex].name || name !== this.petsPrev[petIndex].name) {
			const objName = prefix + '.' + name;
			this.setState(objName + '.name', name, true);
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

		if (!this.objectContainsPath(this.pets[petIndex], 'position.where') || !this.objectContainsPath(this.pets[petIndex], 'position.since')) {
			if (!this.warnings[PET_POSITION_DATA_MISSING][petIndex]) {
				this.log.debug(`no position object found for pet '${name}'`);
				this.warnings[PET_POSITION_DATA_MISSING][petIndex] = true;
			}
		} else {
			if (!this.petsPrev || !this.petsPrev[petIndex] || !this.objectContainsPath(this.petsPrev[petIndex], 'position.where') || !this.objectContainsPath(this.petsPrev[petIndex], 'position.since') || this.pets[petIndex].position.where !== this.petsPrev[petIndex].position.where || this.pets[petIndex].position.since !== this.petsPrev[petIndex].position.since) {
				const objName = prefix + '.' + name;
				this.setState(objName + '.inside', (this.pets[petIndex].position.where === 1), true);
				this.setState(objName + '.since', this.pets[petIndex].position.since, true);
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
		if (this.objectContainsPath(this.report[p], 'feeding.datapoints') && Array.isArray(this.report[p].feeding.datapoints) && this.report[p].feeding.datapoints.length > 0) {
			if (!this.reportPrev[p] || !this.reportPrev[p].feeding || JSON.stringify(this.report[p].feeding) !== JSON.stringify(this.reportPrev[p].feeding)) {
				const consumptionData = this.calculateFoodConsumption(p);
				this.log.debug(`updating food consumed for pet '${this.pets[p].name}' with '${JSON.stringify(consumptionData)}'`);
				this.setState(prefix + '.last_time_eaten', consumptionData.last_time, true);
				this.setState(prefix + '.times_eaten', consumptionData.count, true);
				this.setState(prefix + '.time_spent', consumptionData.time_spent, true);
				this.setState(prefix + '.wet.weight', consumptionData.weight[FEEDER_FOOD_WET], true);
				this.setState(prefix + '.dry.weight', consumptionData.weight[FEEDER_FOOD_DRY], true);
			}
			this.warnings[PET_FEEDING_DATA_MISSING][p] = false;
		} else {
			if (!this.warnings[PET_FEEDING_DATA_MISSING][p]) {
				this.log.warn(`aggregated report for pet '${this.pets[p].name}' does not contain feeding data`);
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
		if (this.objectContainsPath(this.report[p], 'drinking.datapoints') && Array.isArray(this.report[p].drinking.datapoints) && this.report[p].drinking.datapoints.length > 0) {
			if (!this.reportPrev[p] || !this.reportPrev[p].drinking || JSON.stringify(this.report[p].drinking) !== JSON.stringify(this.reportPrev[p].drinking)) {
				const consumptionData = this.calculateWaterConsumption(p);
				this.log.debug(`updating water consumed for pet '${this.pets[p].name}' with '${JSON.stringify(consumptionData)}'`);
				this.setState(prefix + '.last_time_drunk', consumptionData.last_time, true);
				this.setState(prefix + '.times_drunk', consumptionData.count, true);
				this.setState(prefix + '.time_spent', consumptionData.time_spent, true);
				this.setState(prefix + '.weight', consumptionData.weight, true);
			}
			this.warnings[PET_DRINKING_DATA_MISSING][p] = false;
		} else {
			if (!this.warnings[PET_DRINKING_DATA_MISSING][p]) {
				this.log.warn(`aggregated report for pet '${this.pets[p].name}' does not contain drinking data`);
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
		if (this.objectContainsPath(this.report[p], 'movement.datapoints') && Array.isArray(this.report[p].movement.datapoints) && this.report[p].movement.datapoints.length > 0) {
			if (!this.reportPrev[p] || JSON.stringify(this.report[p].movement) !== JSON.stringify(this.reportPrev[p].movement)) {
				const outsideData = this.calculateTimeOutside(p);
				this.log.debug(`updating time outside for pet '${this.pets[p].name}' with '${JSON.stringify(outsideData)}'`);
				this.setState(prefix + '.times_outside', outsideData.count, true);
				this.setState(prefix + '.time_spent_outside', outsideData.time_spent_outside, true);
			}
			this.warnings[PET_OUTSIDE_DATA_MISSING][p] = false;
		} else {
			if (!this.warnings[PET_OUTSIDE_DATA_MISSING][p]) {
				this.log.warn(`aggregated report for pet '${this.pets[p].name}' does not contain movement data`);
				this.warnings[PET_OUTSIDE_DATA_MISSING][p] = true;
			}
		}
	}

	/**
	 * sets pet last movement to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} petIndex
	 * @param {string} petName
	 * @param {number} hid a household id
	 */
	setPetLastMovementToAdapter(prefix, petIndex, petName, hid) {
		if (this.historyPrev[hid] === undefined || JSON.stringify(this.history[hid]) !== JSON.stringify(this.historyPrev[hid])) {
			const movement = this.calculateLastMovement(petName, hid);
			if (movement !== undefined && 'last_direction' in movement && 'last_flap' in movement && 'last_flap_id' in movement && 'last_time' in movement) {
				const hierarchy = '.' + petName + '.movement';
				this.log.debug(`updating last movement for pet '${petName}' with '${JSON.stringify(movement)}'`);
				this.setState(prefix + hierarchy + '.last_time', movement.last_time, true);
				this.setState(prefix + hierarchy + '.last_direction', movement.last_direction, true);
				this.setState(prefix + hierarchy + '.last_flap', movement.last_flap, true);
				this.setState(prefix + hierarchy + '.last_flap_id', movement.last_flap_id, true);
				this.warnings[PET_FLAP_STATUS_DATA_MISSING][petIndex] = false;
			} else {
				if (!this.warnings[PET_FLAP_STATUS_DATA_MISSING][petIndex]) {
					this.log.warn(`history does not contain flap movement for pet '${petName}'`);
					this.warnings[PET_FLAP_STATUS_DATA_MISSING][petIndex] = true;
				}
			}
		}
	}

	/**
	 * sets unknown pet last movement to the adapter
	 */
	setUnknownPetLastMovementToAdapter() {
		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;
			const prefix = this.households[h].name + '.pets.unknown.movement';

			if (this.historyPrev[hid] === undefined || JSON.stringify(this.history[hid]) !== JSON.stringify(this.historyPrev[hid])) {
				const movement = this.calculateLastMovementForUnknownPet(hid);
				if (movement !== undefined && 'last_direction' in movement && 'last_flap' in movement && 'last_flap_id' in movement && 'last_time' in movement) {
					this.log.silly(`updating last movement for unknown pet with '${JSON.stringify(movement)}'`);
					this.setState(prefix + '.last_time', movement.last_time, true);
					this.setState(prefix + '.last_direction', movement.last_direction, true);
					this.setState(prefix + '.last_flap', movement.last_flap, true);
					this.setState(prefix + '.last_flap_id', movement.last_flap_id, true);
				} else {
					this.log.silly(`history does not contain flap movement for unknown pet`);
				}
			}
		}
	}

	/**
	 * sets history event to the adapter
	 *
	 * @param {string} prefix
	 * @param {number} hid a household id
	 * @param {number} index
	 */
	setHistoryEventToAdapter(prefix, hid, index) {
		this.createAdapterStructureFromJson(prefix + '.history.' + index, this.history[hid][index], 'history event ' + index);
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
	 * resets the hub led mode value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} hubName
	 */
	resetHubLedModeToAdapter(hierarchy, hubName) {
		const device = this.getDeviceIndexAndHouseholdId(hubName, [DEVICE_TYPE_HUB]);
		if (device !== undefined) {
			const hubIndex = device.index;
			const hid = device.householdId;

			if (this.devices !== undefined && hid in this.devices && Array.isArray(this.devices[hid]) && this.objectContainsPath(this.devices[hid][hubIndex], 'status.led_mode')) {
				const value = this.devices[hid][hubIndex].status.led_mode;
				this.log.debug(`resetting hub led mode for ${hubName} to: ${value}`);
				this.setState(hierarchy + '.' + hubName + '.control.led_mode', value, true);
			} else {
				this.log.warn(`can not reset hub led mode for '${hubName}' because there is no previous value`);
			}
		} else {
			this.log.warn(`can not reset hub led mode for '${hubName}' because hub was not found`);
		}
	}

	/**
	 * resets the control close delay adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} feederName
	 */
	resetFeederCloseDelayToAdapter(hierarchy, feederName) {
		const device = this.getDeviceIndexAndHouseholdId(feederName, [DEVICE_TYPE_FEEDER]);
		if (device !== undefined) {
			const deviceIndex = device.index;
			const hid = device.householdId;

			if (this.devices !== undefined && hid in this.devices && Array.isArray(this.devices[hid]) && this.objectContainsPath(this.devices[hid][deviceIndex], 'control.lid.close_delay')) {
				const value = this.devices[hid][deviceIndex].control.lid.close_delay;
				this.log.debug(`resetting control close delay for ${feederName} to: ${value}`);
				this.setState(hierarchy + '.control' + '.close_delay', value, true);
			} else {
				this.log.warn(`can not reset control close delay for device '${feederName}' because there is no previous value`);
			}
		} else {
			this.log.warn(`can not reset control close delay for device '${feederName}' because device was not found`);
		}
	}

	/**
	 * resets the flap pet type adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 * @param {string} petName
	 * @param {number} petTag
	 */
	resetFlapPetTypeToAdapter(hierarchy, flapName, petName, petTag) {
		const device = this.getDeviceIndexAndHouseholdId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);

		if (device !== undefined) {
			const deviceIndex = device.index;
			const hid = device.householdId;
			const tagIndex = this.getTagIndexForDeviceIndex(hid, deviceIndex, petTag);

			if (tagIndex !== -1 && this.objectContainsPath(this.devices[hid][deviceIndex].tags[tagIndex], 'profile')) {
				const value = this.devices[hid][deviceIndex].tags[tagIndex].profile;
				this.log.debug(`resetting control pet type for ${flapName} and ${petName} to: ${value}`);
				this.setState(hierarchy + '.' + petName + '.type', value, true);
			} else {
				this.log.warn(`can not reset pet type for device '${flapName}' and pet '${petName}' because there is no previous value`);
			}
		} else {
			this.log.warn(`can not reset pet type for device '${flapName}' and pet '${petName}' because device was not found`);
		}
	}

	/**
	 * resets the flap lockmode adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 */
	resetFlapLockModeToAdapter(hierarchy, flapName) {
		const device = this.getDeviceIndexAndHouseholdId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (device !== undefined) {
			const deviceIndex = device.index;
			const hid = device.householdId;

			if (this.devices !== undefined && hid in this.devices && Array.isArray(this.devices[hid]) && this.objectContainsPath(this.devices[hid][deviceIndex], 'status.locking.mode')) {
				const value = this.devices[hid][deviceIndex].status.locking.mode;
				this.log.debug(`resetting control lockmode for ${flapName} to: ${value}`);
				this.setState(hierarchy + '.control' + '.lockmode', value, true);
			} else {
				this.log.warn(`can not reset control lockmode for device '${flapName}' because there is no previous value`);
			}
		} else {
			this.log.warn(`can not reset control lockmode for device '${flapName}' because device was not found`);
		}
	}

	/**
	 * resets the pet location adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} petName
	 */
	resetPetLocationToAdapter(hierarchy, petName) {
		const petIndex = this.getPetIndex(petName);
		if (Array.isArray(this.pets) && this.objectContainsPath(this.pets[petIndex], 'position.where')) {
			const value = this.pets[petIndex].position.where;
			this.log.debug(`resetting pet inside for ${petName} to: ${value}`);
			this.setState(hierarchy + '.pets.' + petName + '.inside', value, true);
		} else {
			this.log.warn(`can not reset pet inside for '${petName}' because there is no previous value`);
		}
	}

	/**
	 * resets the pet assigment adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} deviceName
	 * @param {string} petName
	 */
	resetPetAssigmentToAdapter(hierarchy, deviceName, petName) {
		const device = this.getDeviceIndexAndHouseholdId(deviceName, []);
		const petTagId = this.getPetTagId(petName);
		if (device && petTagId !== -1 && this.devices && Array.isArray(this.devices[device.householdId]) && this.objectContainsPath(this.devices[device.householdId][device.index], 'tags')) {
			const value = this.doesTagsArrayContainTagId(this.devices[device.householdId][device.index].tags, petTagId);
			this.log.debug(`resetting pet assigment of ${petName} for '${deviceName}' to: ${value ? 'assigned' : 'unassigned'}`);
			this.setState(hierarchy + '.pets.' + petName + '.assigned', value, true);
		} else {
			this.log.warn(`can not reset pet assignment of '${petName}' for '${deviceName}' because there is no previous value`);
		}
	}

	/**
	 * resets the control curfew_enabled adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} flapName
	 */
	resetFlapCurfewEnabledToAdapter(hierarchy, flapName) {
		const device = this.getDeviceIndexAndHouseholdId(flapName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (device !== undefined) {
			const deviceIndex = device.index;
			const hid = device.householdId;

			if (this.devices !== undefined && hid in this.devices && Array.isArray(this.devices[hid]) && this.objectContainsPath(this.devices[hid][deviceIndex], 'control.curfew')) {
				const value = this.isCurfewEnabled(this.devices[hid][deviceIndex].control.curfew);
				this.log.debug(`resetting control curfew_enabled for ${flapName} to: ${value}`);
				this.setState(hierarchy + '.control' + '.curfew_enabled', value, true);
			} else {
				this.log.warn(`can not reset control curfew_enabled for device '${flapName}' because there is no previous value`);
			}
		} else {
			this.log.warn(`can not reset control curfew_enabled for device '${flapName}' because device was not found`);
		}
	}

	/**
	 * resets the control current_curfew adapter value to the state value
	 *
	 * @param {string} hierarchy
	 * @param {string} deviceName
	 */
	resetControlCurrentCurfewToAdapter(hierarchy, deviceName) {
		const device = this.getDeviceIndexAndHouseholdId(deviceName, [DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP]);
		if (device !== undefined) {
			const deviceIndex = device.index;
			const hid = device.householdId;

			if (this.devices !== undefined && hid in this.devices && Array.isArray(this.devices[hid]) && this.objectContainsPath(this.devices[hid][deviceIndex], 'control.curfew')) {
				const value = JSON.stringify(this.devices[hid][deviceIndex].control.curfew);
				this.log.debug(`resetting control current_curfew for ${deviceName}`);
				this.setState(hierarchy + '.control' + '.current_curfew', value, true);
			} else {
				this.log.warn(`can not reset control current_curfew for device '${deviceName}' because there is no previous value`);
			}
		} else {
			this.log.warn(`can not reset control current_curfew for device '${deviceName}' because device was not found`);
		}
	}

	/******************************************************
	 * methods to get objects and values from the adapter *
	 ******************************************************/

	/**
	 * reads adapter version from the adapter
	 *
	 * @return {Promise} Promise of a version string
	 */
	getAdapterVersionFromAdapter() {
		return new Promise((resolve) => {
			this.getStateValueFromAdapter('info.version').then(version => {
				if (version === undefined || version === null) {
					this.log.silly(`getting adapter version failed because it was null or empty`);
					this.log.debug(`last running adapter version is unknown.`);
					return resolve('unknown');
				} else {
					this.log.debug(`last running adapter version is '${version}'.`);
					return resolve(version);
				}
			}).catch(err => {
				this.log.silly(`getting adapter version failed because '${err}'`);
				this.log.debug(`last running adapter version is unknown.`);
				return resolve('unknown');
			});
		});
	}

	/**
	 * reads curfew data from the adapter
	 *
	 * @param {string} objName
	 * @return {Promise} Promise of a curfew JSon object
	 */
	getCurfewFromAdapter(objName) {
		return new Promise((resolve, reject) => {
			this.getStateValueFromAdapter(objName).then(curfewJson => {
				if (curfewJson === undefined || curfewJson === null) {
					this.log.silly(`getting curfew state from '${objName}' failed because it was null or empty`);
					return reject('curfew state is empty');
				}
				try {
					return resolve(JSON.parse(curfewJson));
				} catch (err) {
					this.log.silly(`getting curfew state from '${objName}' failed because '${err}'`);
					return reject(err);
				}
			}).catch(err => {
				this.log.silly(`getting curfew state from '${objName}' failed because '${err}'`);
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
	 * @param {string} objName
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObjectFormAdapterIfExists(objName, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting object '${objName}'`);
			this.getObject(objName, (err, obj) => {
				if (!err && obj) {
					this.log.silly(`found object '${objName}'. trying to delete ...`);
					this.delObject(obj._id, {'recursive': recursive}, (err) => {
						if (err) {
							this.log.error(`could not delete object '${objName}' (${err})`);
							return reject();
						} else {
							this.log.silly(`deleted object '${objName}'`);
							return resolve();
						}
					});
				} else {
					this.log.silly(`object '${objName}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes an obsolete object if it exists
	 *
	 * @param {string} objName the device name
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObsoleteObjectIfExists(objName, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting obsolete object '${objName}'`);
			this.getObject(objName, (err, obj) => {
				if (!err && obj) {
					this.log.debug(`obsolete object ${objName} found. trying to delete ...`);
					this.delObject(obj._id, {'recursive': recursive}, (err) => {
						if (err) {
							this.log.error(`can not delete obsolete object ${objName} because: ${err}`);
							return reject();
						} else {
							this.log.debug(`obsolete object '${objName}' deleted`);
							return resolve();
						}
					});
				} else {
					this.log.silly(`obsolete object '${objName}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes an obsolete object if it exists and has given type
	 *
	 * @param {string} objName the device name
	 * @param {string} type
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObsoleteObjectIfExistsAndHasType(objName, type, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting obsolete object '${objName}'`);
			this.getObject(objName, (err, obj) => {
				if (!err && obj) {
					if (obj.type === type) {
						this.log.debug(`obsolete object ${objName} found. trying to delete ...`);
						this.delObject(obj._id, {'recursive': recursive}, (err) => {
							if (err) {
								this.log.error(`can not delete obsolete object ${objName} because: ${err}`);
								return reject();
							} else {
								this.log.debug(`obsolete object '${objName}' deleted`);
								return resolve();
							}
						});
					} else {
						this.log.silly(`obsolete object '${objName}' found but was not of type '${type}'`);
						return resolve();
					}
				} else {
					this.log.silly(`obsolete object '${objName}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes an obsolete object if it exists and has the device_id in its name
	 *
	 * @param {string} objName the device name
	 * @param {string} device_id the device id
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObsoleteObjectWithDeviceIdIfExists(objName, device_id, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting obsolete object '${objName}'`);
			this.getObject(objName, (err, obj) => {
				if (!err && obj) {
					if (obj.common !== undefined && obj.common.name !== undefined && obj.common.name.toString().includes(device_id)) {
						this.log.debug(`obsolete object ${objName} found. trying to delete ...`);
						this.delObject(obj._id, {'recursive': recursive}, (err) => {
							if (err) {
								this.log.error(`can not delete obsolete object ${objName} because: ${err}`);
								return reject();
							} else {
								this.log.debug(`obsolete object '${objName}' deleted`);
								return resolve();
							}
						});
					} else {
						this.log.silly(`obsolete object '${objName}' found, but name '${obj.common.name.toString()}' does not contain correct device id '${device_id}'.`);
						return resolve();
					}
				} else {
					this.log.silly(`obsolete object '${objName}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes the history for a household from the adapter
	 *
	 * @param {number} householdIndex
	 * @param {number} hid a household id
	 * @param {boolean} all
	 * @return {Promise}
	 */
	deleteEventHistoryForHousehold(householdIndex, hid, all) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const prefix = this.households[householdIndex].name;
			const numberToDelete = (all ? 25 : this.history[hid].length);

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
			const numPets = this.pets.length;
			const petsChannelNames = [];

			for (let p = 0; p < numPets; p++) {
				const nameOrg = this.pets[p].name_org;
				const petId = this.pets[p].id;
				petsChannelNames.push('Pet \'' + nameOrg + '\' (' + petId + ')');
			}

			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				const prefix = this.households[h].name;

				// check for pets in households
				getObjectsPromiseArray.push(this.getObjectsByPatternAndType(this.name + '.' + this.instance + '.' + prefix + '.pets.*', 'channel', false));

				// check for assigned_pets in devices
				for (let d = 0; d < this.devices[hid].length; d++) {
					if (this.devices[hid][d].household_id === this.households[h].id) {
						// all devices except hub
						if (this.hasParentDevice(this.devices[hid][d])) {
							if ([DEVICE_TYPE_FEEDER, DEVICE_TYPE_WATER_DISPENSER, DEVICE_TYPE_PET_FLAP, DEVICE_TYPE_CAT_FLAP].includes(this.devices[hid][d].product_id)) {
								const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
								getObjectsPromiseArray.push(this.getObjectsByPatternAndType(this.name + '.' + this.instance + '.' + objName + 'control.pets.*', 'channel', false));
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
	 * removes type of unassigned pets
	 *
	 * @return {Promise}
	 */
	removePetTypeOfUnassignedPetsFromAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.log.debug(`searching and removing of pet type for unassigned pets`);

			const getObjectsPromiseArray = [];
			const numPets = this.pets.length;

			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				const prefix = this.households[h].name;

				// check for unassigned_pets in devices
				for (let d = 0; d < this.devices[hid].length; d++) {
					if (this.devices[hid][d].household_id === this.households[h].id) {
						// only cat flap supports pet type
						if (this.hasParentDevice(this.devices[hid][d]) && [DEVICE_TYPE_CAT_FLAP].includes(this.devices[hid][d].product_id)) {
							const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
							for (let p = 0; p < numPets; p++) {
								if (!this.objectContainsPath(this.devices[hid][d], 'tags') || !this.doesTagsArrayContainTagId(this.devices[hid][d].tags, this.pets[p].tag_id)) {
									getObjectsPromiseArray.push(this.getObjectsByPatternAndType(this.name + '.' + this.instance + '.' + objName + '.control.pets.' + this.pets[p].name + '.type', 'state', false));
									//deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(objName + '.control.pets.' + this.pets[p].name + '.type', false));
								}
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
							this.log.debug(`pet type for unassigned pet found (${obj[key]._id}). trying to delete (${obj[key].type})`);
							deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(obj[key]._id, false));
						});
					}
				});
				// wait for all delete object promises
				Promise.all(deletePromiseArray).then(() => {
					this.log.debug(`searching and removing of pet type for unassigned pets complete`);
					return resolve();
				}).catch(() => {
					this.log.warn(`searching and removing of pet type for unassigned pets failed`);
					return resolve();
				});
			}).catch(() => {
				this.log.warn(`searching and removing of pet type for unassigned pets failed`);
				return resolve();
			});
		}));
	}

	/**
	 * removes obsolete data structures from the adapter
	 * When there are changes to the data structures obsolete entries go here.
	 *
	 * @param {String} version a version string in format patch.major.minor or 'unknown'
	 * @return {Promise}
	 */
	removeDeprecatedDataFromAdapter(version) {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const deletePromiseArray = [];

			if (ADAPTER_VERSION !== version && version !== 'unknown') {
				this.log.info(`adapter was upgraded from '${version}' to '${ADAPTER_VERSION}'.`);
			}

			this.log.debug(`searching and removing of obsolete objects`);
			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				const prefix = this.households[h].name;

				if (version === 'unknown' || this.isVersionLessThan(version, '3.0.0')) {
					// these fixes are only necessary for versions before 3.0.0
					this.log.debug(`searching and removing of obsolete objects for adapter versions before 3.0.0`);
					for (let d = 0; d < this.devices[hid].length; d++) {
						if (this.devices[hid][d].household_id === this.households[h].id) {
							// hardware and firmware version was changed from number to string
							if (this.hasParentDevice(this.devices[hid][d])) {
								const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
								this.log.silly(`checking for version states with type number for device '${objName}'.`);

								deletePromiseArray.push(this.removeVersionNumberFromDevices(objName));
							} else {
								const objName = prefix + '.' + this.devices[hid][d].name;
								this.log.silly(`checking for version states with type number for device '${objName}'.`);

								deletePromiseArray.push(this.removeVersionNumberFromDevices(objName));
							}

							// missing parent object of API change on 2023_10_02 created all devices without hierarchy (as hubs)
							if (this.hasParentDevice(this.devices[hid][d])) {
								const objName = prefix + '.' + this.devices[hid][d].name;
								this.log.silly(`checking for non hub devices under household with name '${objName}'.`);

								// remove non hub devices from top hierarchy
								deletePromiseArray.push(this.deleteObsoleteObjectWithDeviceIdIfExists(objName, this.devices[hid][d].id, true));
							}

							// hub
							if (!this.hasParentDevice(this.devices[hid][d])) {
								const objName = prefix + '.' + this.devices[hid][d].name;
								this.log.silly(`checking for led_mode for hub '${objName}'.`);

								// made led_mode changeable and moved it to control.led_mode
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.led_mode', false));
							} else {
								// feeding bowl
								if (this.devices[hid][d].product_id === DEVICE_TYPE_FEEDER) {
									// feeding bowl
									const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
									this.log.silly(`checking for curfew states for feeder '${objName}'.`);

									// feeder had unnecessary attributes of flap
									deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.curfew', true));
									deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.last_curfew', true));
									deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.curfew_active', false));
									deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.control.lockmode', false));
									deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.control.curfew', false));
								}
								// pet flap
								if (this.devices[hid][d].product_id === DEVICE_TYPE_PET_FLAP) {
									// pet flap
									const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
									this.log.silly(`checking for pet types for pet flap '${objName}'.`);

									// pet flap had pet type control which is an exclusive feature of cat flap
									if ('tags' in this.devices[hid][d]) {
										for (let t = 0; t < this.devices[hid][d].tags.length; t++) {
											const name = this.getPetNameForTagId(this.devices[hid][d].tags[t].id);
											if (name !== undefined) {
												deletePromiseArray.push(this.removeAssignedPetsFromPetFlap(objName + '.assigned_pets.' + name));
											} else {
												this.log.warn(`could not find pet with pet tag id (${this.devices[hid][d].tags[t].id})`);
												this.log.debug(`pet flap '${objName}' has ${this.devices[hid][d].tags.length} pets assigned and household has ${this.pets.length} pets assigned.`);
											}
										}
									}
								}

								// cat flap and pet flap
								if (this.devices[hid][d].product_id === DEVICE_TYPE_CAT_FLAP || this.devices[hid][d].product_id === DEVICE_TYPE_PET_FLAP) {
									// remove deprecated curfew objects
									const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
									deletePromiseArray.push(this.deleteObsoleteObjectIfExistsAndHasType(objName + '.curfew', 'channel', true));
									deletePromiseArray.push(this.deleteObsoleteObjectIfExistsAndHasType(objName + '.last_curfew', 'channel', true));
									deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(objName + '.control' + '.curfew', false));
								}
							}
						}
					}
				}

				if (version === 'unknown' || this.isVersionLessThan(version, '3.2.0')) {
					// these fixes are only necessary for versions before 3.2.0
					this.log.debug(`searching and removing of obsolete objects for adapter versions before 3.2.0`);
					for (let d = 0; d < this.devices[hid].length; d++) {
						if (this.devices[hid][d].household_id === this.households[h].id) {
							if (this.hasParentDevice(this.devices[hid][d])) {
								// assigned pets moved from .assigned_pets.* to .control.pets.*.assigned
								const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
								this.log.silly(`checking for .assigned_pets.* for device '${objName}'.`);
								deletePromiseArray.push(this.deleteObsoleteObjectIfExists(objName + '.assigned_pets', true));
							}
						}
					}
				}

				// deprecated history
				if (!this.config.history_enable) {
					for (let h = 0; h < this.households.length; h++) {
						const hid = this.households[h].id;
						const prefix = this.households[h].name;
						this.log.silly(`checking for deprecated event history for household '${prefix}'`);

						deletePromiseArray.push(this.deleteEventHistoryForHousehold(h, hid, true));
					}
				}

				// delete json history events if number of history events decreased
				this.log.silly(`checking for surplus history events.`);
				for (let j = this.config.history_json_entries; j < 25; j++) {
					deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(this.name + '.' + this.instance + '.' + prefix + '.history.json.' + j, false));
				}

				// delete unknown pet if unknown pet movement is disabled
				if (!this.config.unknown_movement_enable) {
					this.log.silly(`checking for unknown pet movement.`);
					deletePromiseArray.push(this.deleteObjectFormAdapterIfExists(this.name + '.' + this.instance + '.' + prefix + '.pets.unknown', true));
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
	 * @param {string} objName the device name
	 * @return {Promise}
	 */
	removeVersionNumberFromDevices(objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.getObject(objName + '.version.firmware', (err, obj) => {
				if (!err && obj && obj.common.type === 'number') {
					this.log.silly(`obsolete number objects in ${objName}.version found. trying to delete recursively`);

					this.deleteObsoleteObjectIfExists(objName + '.version', true).then(() => {
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
	 * @param {string} objName the device name
	 * @return {Promise}
	 */
	removeAssignedPetsFromPetFlap(objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.getObject(objName, (err, obj) => {
				if (!err && obj && obj.type === 'channel') {
					this.log.silly(`obsolete channel object ${objName} found. trying to delete recursively`);

					this.deleteObsoleteObjectIfExists(objName, true).then(() => {
						this.log.info(`deleted assigned pets for pet flap ${objName} because of obsolete control for pet type. please restart adapter to show assigned pets again.`);
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
				this.getAdapterVersionFromAdapter()
					.then(version => this.removeDeprecatedDataFromAdapter(version))
					.then(() => this.removeDeletedAndRenamedPetsFromAdapter())
					.then(() => this.removePetTypeOfUnassignedPetsFromAdapter())
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
			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				const prefix = this.households[h].name;

				// create household folder
				this.setObjectNotExists(this.households[h].name, this.buildFolderObject('Household \'' + this.households[h].name_org + '\' (' + this.households[h].id + ')'), () => {
					// create history folder
					this.setObjectNotExists(this.households[h].name + '.history', this.buildFolderObject('Event History'), () => {
						this.setObjectNotExists(this.households[h].name + '.history.json', this.buildFolderObject('JSON'), () => {
							if (this.config.history_json_enable) {
								// create json history states
								const objName = this.households[h].name + '.history.json.';
								for (let j = 0; j < this.config.history_json_entries; j++) {
									promiseArray.push(this.setObjectNotExistsPromise(objName + j, this.buildStateObject('history event ' + j, 'json', 'string')));
								}
							}

							// create hub (devices in household without parent)
							for (let d = 0; d < this.devices[hid].length; d++) {
								if ('product_id' in this.devices[hid][d] && this.devices[hid][d].product_id === DEVICE_TYPE_HUB) {
									const objName = prefix + '.' + this.devices[hid][d].name;
									this.setObjectNotExists(objName, this.buildDeviceObject('Hub \'' + this.devices[hid][d].name_org + '\' (' + this.devices[hid][d].id + ')'), () => {
										promiseArray.push(this.setObjectNotExistsPromise(objName + '.online', this.buildStateObject('if device is online', 'indicator.reachable')));
										promiseArray.push(this.setObjectNotExistsPromise(objName + '.serial_number', this.buildStateObject('serial number of device', 'text', 'string')));
										promiseArray.push(this.setObjectNotExistsPromise(objName + '.control', this.buildChannelObject('control switches')));
										promiseArray.push(this.createVersionsToAdapter(hid, d, objName));
										Promise.all(promiseArray).then(() => {
											this.setObjectNotExists(objName + '.control.led_mode', this.buildStateObject('led mode', 'indicator', 'number', false, {
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
			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;
				const prefix = this.households[h].name;

				// create devices in household with parent (flaps, feeding bowl and water dispenser)
				for (let d = 0; d < this.devices[hid].length; d++) {
					if (this.hasParentDevice(this.devices[hid][d])) {
						const objName = prefix + '.' + this.getParentDeviceName(this.devices[hid][d]) + '.' + this.devices[hid][d].name;
						switch (this.devices[hid][d].product_id) {
							case DEVICE_TYPE_PET_FLAP:
								// pet flap
								this.log.debug(`found pet flap`);
								promiseArray.push(this.createFlapDevicesToAdapter(hid, d, objName, false));
								break;
							case DEVICE_TYPE_CAT_FLAP:
								// cat flap
								this.log.debug(`found cat flap`);
								promiseArray.push(this.createFlapDevicesToAdapter(hid, d, objName, true));
								break;
							case DEVICE_TYPE_FEEDER:
								// feeder
								this.log.debug(`found feeder`);
								promiseArray.push(this.createFeederDevicesToAdapter(hid, d, objName));
								break;
							case DEVICE_TYPE_WATER_DISPENSER:
								// water dispenser
								this.log.debug(`found felaqua`);
								promiseArray.push(this.createWaterDispenserDevicesToAdapter(hid, d, objName));
								break;
							default:
								this.log.debug(`device with unknown id (${this.devices[hid][d].product_id}) found`);
								break;
						}
					} else {
						if ('product_id' in this.devices[hid][d] && this.devices[hid][d].product_id === DEVICE_TYPE_HUB) {
							this.log.debug(`hub felaqua`);
						} else {
							this.log.debug(`device without parent and with unknown id (${this.devices[hid][d].product_id}) found`);
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
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {string} objName
	 * @return {Promise}
	 */
	createCommonStatusToAdapter(hid, deviceIndex, objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			promiseArray.push(this.setObjectNotExistsPromise(objName + '.online', this.buildStateObject('if device is online', 'indicator.reachable')));
			promiseArray.push(this.setObjectNotExistsPromise(objName + '.battery', this.buildStateObject('battery', 'value.voltage', 'number')));
			promiseArray.push(this.setObjectNotExistsPromise(objName + '.battery_percentage', this.buildStateObject('battery percentage', 'value.battery', 'number')));
			promiseArray.push(this.setObjectNotExistsPromise(objName + '.serial_number', this.buildStateObject('serial number of device', 'text', 'string')));
			this.setObjectNotExists(objName + '.signal', this.buildChannelObject('signal strength'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(objName + '.signal' + '.device_rssi', this.buildStateObject('device rssi', 'value.signal.rssi', 'number')));
				promiseArray.push(this.setObjectNotExistsPromise(objName + '.signal' + '.hub_rssi', this.buildStateObject('hub rssi', 'value.signal.rssi', 'number')));
				promiseArray.push(this.createVersionsToAdapter(hid, deviceIndex, objName));
				Promise.all(promiseArray).then(() => {
					this.log.silly(`adapter common status hierarchy for device ${this.devices[hid][deviceIndex].name} created`);
					return resolve();
				}).catch(error => {
					this.log.warn(`could not create adapter common status hierarchy for device ${this.devices[hid][deviceIndex].name} (${error})`);
					return reject();
				});
			});
		}));
	}

	/**
	 * creates hardware and software versions data structures in the adapter
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {string} objName
	 * @return {Promise}
	 */
	createVersionsToAdapter(hid, deviceIndex, objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(objName + '.version', this.buildChannelObject('version'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(objName + '.version' + '.hardware', this.buildStateObject('hardware version', 'info.hardware', 'string')));
				promiseArray.push(this.setObjectNotExistsPromise(objName + '.version' + '.firmware', this.buildStateObject('firmware version', 'info.firmware', 'string')));
				Promise.all(promiseArray).then(() => {
					this.log.silly(`adapter versions hierarchy for device ${this.devices[hid][deviceIndex].name} created`);
					return resolve();
				}).catch(error => {
					this.log.warn(`could not create adapter versions hierarchy for device ${this.devices[hid][deviceIndex].name} (${error})`);
					return reject();
				});
			});
		}));
	}

	/**
	 * creates cat and pet flap device hierarchy data structures in the adapter
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {string} objName
	 * @param {boolean} isCatFlap
	 * @return {Promise}
	 */
	createFlapDevicesToAdapter(hid, deviceIndex, objName, isCatFlap) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(objName, this.buildDeviceObject('device \'' + this.devices[hid][deviceIndex].name_org + '\' (' + this.devices[hid][deviceIndex].id + ')'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(objName + '.last_enabled_curfew', this.buildStateObject('last enabled curfew settings', 'json', 'string')));
				promiseArray.push(this.setObjectNotExistsPromise(objName + '.curfew_active', this.buildStateObject('if curfew is enabled and currently active', 'indicator')));
				promiseArray.push(this.createCommonStatusToAdapter(hid, deviceIndex, objName));
				this.setObjectNotExists(objName + '.control', this.buildChannelObject('control switches'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.control' + '.lockmode', this.buildStateObject('lockmode', 'switch.mode.lock', 'number', false, {
						0: 'OPEN',
						1: 'LOCK INSIDE',
						2: 'LOCK OUTSIDE',
						3: 'LOCK BOTH'
					})));
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.control' + '.curfew_enabled', this.buildStateObject('is curfew enabled', 'switch', 'boolean', false)));
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.control' + '.current_curfew', this.buildStateObject('current curfew settings', 'json', 'string', false)));

					for (let p = 0; p < this.pets.length; p++) {
						promiseArray.push(this.createPetAssignedControl(hid, deviceIndex, this.pets[p], objName));
					}
					if (isCatFlap && 'tags' in this.devices[hid][deviceIndex]) {
						for (let t = 0; t < this.devices[hid][deviceIndex].tags.length; t++) {
							promiseArray.push(this.createAssignedPetsTypeControl(hid, deviceIndex, t, objName));
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
		}));
	}

	/**
	 * creates feeder bowl device hierarchy data structures in the adapter
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {string} objName
	 * @return {Promise}
	 */
	createFeederDevicesToAdapter(hid, deviceIndex, objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(objName, this.buildDeviceObject('device \'' + this.devices[hid][deviceIndex].name_org + '\' (' + this.devices[hid][deviceIndex].id + ')'), () => {
				promiseArray.push(this.createCommonStatusToAdapter(hid, deviceIndex, objName));

				this.setObjectNotExists(objName + '.control', this.buildChannelObject('control switches'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.control' + '.close_delay', this.buildStateObject('closing delay of lid', 'switch.mode.delay', 'number', false, {
						0: 'FAST',
						4: 'NORMAL',
						20: 'SLOW'
					})));

					for (let p = 0; p < this.pets.length; p++) {
						promiseArray.push(this.createPetAssignedControl(hid, deviceIndex, this.pets[p], objName));
					}

					this.setObjectNotExists(objName + '.bowls', this.buildChannelObject('feeding bowls'), () => {
						this.setObjectNotExists(objName + '.bowls.0', this.buildChannelObject('feeding bowl 0'), () => {
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.0.food_type', this.buildStateObject('type of food in bowl', 'value', 'number', true, {
								1: 'WET',
								2: 'DRY'
							})));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.0.target', this.buildStateObject('target weight', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.0.weight', this.buildStateObject('weight', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.0.fill_percent', this.buildStateObject('fill percentage', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.0.last_filled_at', this.buildStateObject('last filled at', 'date', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.0.last_zeroed_at', this.buildStateObject('last zeroed at', 'date', 'string')));

							if (this.objectContainsPath(this.devices[hid][deviceIndex], 'control.bowls.type') && this.devices[hid][deviceIndex].control.bowls.type === FEEDER_SINGLE_BOWL) {
								// remove bowl 1 (e.g. after change from dual to single bowl)
								promiseArray.push(this.deleteObjectFormAdapterIfExists(objName + '.bowls.1', true));
								Promise.all(promiseArray).then(() => {
									return resolve();
								}).catch(error => {
									this.log.warn(`could not create adapter feeder device hierarchy (${error})`);
									return reject();
								});
							} else {
								this.setObjectNotExists(objName + '.bowls.1', this.buildChannelObject('feeding bowl 1'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.1.food_type', this.buildStateObject('type of food in bowl', 'value', 'number', true, {
										1: 'WET',
										2: 'DRY'
									})));
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.1.target', this.buildStateObject('target weight', 'value', 'number')));
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.1.weight', this.buildStateObject('weight', 'value', 'number')));
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.1.fill_percent', this.buildStateObject('fill percentage', 'value', 'number')));
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.1.last_filled_at', this.buildStateObject('last filled at', 'date', 'string')));
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.bowls.1.last_zeroed_at', this.buildStateObject('last zeroed at', 'date', 'string')));

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
				});
			});
		}));
	}

	/**
	 * creates water dispenser device hierarchy data structures in the adapter
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {string} objName
	 * @return {Promise}
	 */
	createWaterDispenserDevicesToAdapter(hid, deviceIndex, objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(objName, this.buildDeviceObject('device \'' + this.devices[hid][deviceIndex].name_org + '\' (' + this.devices[hid][deviceIndex].id + ')'), () => {
				promiseArray.push(this.createCommonStatusToAdapter(hid, deviceIndex, objName));

				for (let p = 0; p < this.pets.length; p++) {
					promiseArray.push(this.createPetAssignedControl(hid, deviceIndex, this.pets[p], objName));
				}

				this.setObjectNotExists(objName + '.water', this.buildChannelObject('remaining water'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.water.weight', this.buildStateObject('weight', 'value', 'number')));
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.water.fill_percent', this.buildStateObject('fill percentage', 'value', 'number')));
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.water.last_filled_at', this.buildStateObject('last filled at', 'date', 'string')));
					Promise.all(promiseArray).then(() => {
						return resolve();
					}).catch(error => {
						this.log.warn(`could not create adapter water dispenser device hierarchy (${error})`);
						return reject();
					});
				});
			});
		}));
	}

	/**
	 * creates an assigned pet and their type control for sureflap adapter
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {number} tag
	 * @param {string} objName
	 * @return {Promise}
	 */
	createAssignedPetsTypeControl(hid, deviceIndex, tag, objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const id = this.getPetIdForTagId(this.devices[hid][deviceIndex].tags[tag].id);
			const name = this.getPetNameForTagId(this.devices[hid][deviceIndex].tags[tag].id);
			const nameOrg = this.getPetNameOrgForTagId(this.devices[hid][deviceIndex].tags[tag].id);
			if (id !== undefined && name !== undefined && nameOrg !== undefined) {
				this.setObjectNotExists(objName + '.control', this.buildChannelObject('control switches'), () => {
					this.setObjectNotExists(objName + '.control.pets', this.buildChannelObject('pets'), () => {
						this.setObjectNotExists(objName + '.control.pets.' + name, this.buildChannelObject('pet \'' + nameOrg + '\' (' + id + ')'), () => {
							this.setObjectNotExistsPromise(objName + '.control.pets.' + name + '.type', this.buildStateObject('pet type', 'switch.mode.type', 'number', false, {
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
				});
			} else {
				this.log.warn(`could not find pet with pet tag id (${this.devices[hid][deviceIndex].tags[tag].id})`);
				this.log.debug(`cat flap '${this.devices[hid][deviceIndex].name}' has ${this.devices[hid][deviceIndex].tags.length} pets assigned and household has ${this.pets.length} pets assigned.`);
				return reject();
			}
		}));
	}

	/**
	 * creates a pet and their assigned control for sureflap adapter
	 *
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {object} pet
	 * @param {string} objName
	 * @return {Promise}
	 */
	createPetAssignedControl(hid, deviceIndex, pet, objName) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if (pet !== undefined && pet.id !== undefined && pet.name !== undefined && pet.name_org !== undefined) {
				this.setObjectNotExists(objName + '.control', this.buildChannelObject('control switches'), () => {
					this.setObjectNotExists(objName + '.control.pets', this.buildChannelObject('pets'), () => {
						this.setObjectNotExists(objName + '.control.pets.' + pet.name, this.buildChannelObject('pet \'' + pet.name_org + '\' (' + pet.id + ')'), () => {
							this.setObjectNotExistsPromise(objName + '.control.pets.' + pet.name + '.assigned', this.buildStateObject('is pet assigned to this device', 'switch.mode.assigned', 'boolean', false)).then(() => {
								return resolve();
							}).catch(error => {
								this.log.warn(`could not create adapter flap device control pets hierarchy (${error})`);
								return reject();
							});
						});
					});
				});
			} else {
				if (pet !== undefined) {
					this.log.warn(`provided pet has missing data: pet id (${pet.id}), pet name (${pet.name}), pet original name (${pet.name_org})`);
					this.log.debug(`device '${this.devices[hid][deviceIndex].name}' has ${this.devices[hid][deviceIndex].tags.length} pets assigned and household has ${this.pets.length} pets assigned.`);
				} else {
					this.log.warn(`provided pet is undefined.`);
				}
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
			const numPets = this.pets.length;

			for (let p = 0; p < numPets; p++) {
				const petName = this.pets[p].name;
				const petNameOrg = this.pets[p].name_org;
				const petId = this.pets[p].id;
				const householdName = this.getHouseholdNameForId(this.pets[p].household_id);
				if (householdName !== undefined) {
					const prefix = householdName + '.pets';
					promiseArray.push(this.createPetHierarchyToAdapter(prefix, householdName, petName, petNameOrg, petId));
				} else {
					if (!this.warnings[PET_HOUSEHOLD_MISSING][p]) {
						this.log.warn(`could not get household for pet (${petName})`);
						this.warnings[PET_HOUSEHOLD_MISSING][p] = true;
					}
				}
			}
			if (this.config.unknown_movement_enable) {
				for (let h = 0; h < this.households.length; h++) {
					this.createUnknownPetsToAdapter(this.households[h].id);
				}
			} else {
				Promise.all(promiseArray).then(() => {
					return resolve();
				}).catch(() => {
					this.log.error(`creating pets hierarchy failed.`);
					return reject();
				});
			}
		}));
	}

	/**
	 * creates unknown pet hierarchy data structures in the adapter
	 *
	 * @param {string} hid
	 * @return {Promise}
	 */
	createUnknownPetsToAdapter(hid) {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const promiseArray = [];
			const householdName = this.getHouseholdNameForId(hid);
			const prefix = householdName + '.pets';

			this.setObjectNotExists(prefix, this.buildDeviceObject('Pets in Household ' + householdName), () => {
				this.setObjectNotExists(prefix + '.unknown', this.buildChannelObject('Unknown Pet (unknown)'), () => {
					this.setObjectNotExists(prefix + '.unknown' + '.movement', this.buildFolderObject('movement'), () => {
						promiseArray.push(this.setObjectNotExistsPromise(prefix + '.unknown' + '.movement' + '.last_time', this.buildStateObject('date and time of last movement', 'date', 'string')));
						promiseArray.push(this.setObjectNotExistsPromise(prefix + '.unknown' + '.movement' + '.last_direction', this.buildStateObject('direction of last movement', 'value', 'number')));
						promiseArray.push(this.setObjectNotExistsPromise(prefix + '.unknown' + '.movement' + '.last_flap', this.buildStateObject('name of last used flap', 'value', 'string')));
						promiseArray.push(this.setObjectNotExistsPromise(prefix + '.unknown' + '.movement' + '.last_flap_id', this.buildStateObject('id of last used flap', 'value', 'number')));

						Promise.all(promiseArray).then(() => {
							return resolve();
						}).catch(() => {
							this.log.error(`creating unknown pets hierarchy failed.`);
							return resolve();
						});
					});
				});
			});
		}));
	}

	/**
	 * creates hierarchy data structures for the given pet in the adapter
	 *
	 * @param {string} prefix
	 * @param {string} householdName
	 * @param {string} petName
	 * @param {string} petNameOrg
	 * @param {number} petId
	 * @return {Promise}
	 */
	createPetHierarchyToAdapter(prefix, householdName, petName, petNameOrg, petId) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const objName = prefix + '.' + petName;
			this.setObjectNotExists(prefix, this.buildDeviceObject('Pets in Household ' + householdName), () => {
				this.setObjectNotExists(objName, this.buildChannelObject('Pet \'' + petNameOrg + '\' (' + petId + ')'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(objName + '.name', this.buildStateObject(petNameOrg, 'text', 'string')));
					if (this.hasFlap) {
						promiseArray.push(this.setObjectNotExistsPromise(objName + '.inside', this.buildStateObject('is ' + petName + ' inside', 'indicator', 'boolean', false)));
						promiseArray.push(this.setObjectNotExistsPromise(objName + '.since', this.buildStateObject('last location change', 'date', 'string')));
						this.setObjectNotExists(objName + '.movement', this.buildFolderObject('movement'), () => {
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.movement' + '.last_time', this.buildStateObject('date and time of last movement', 'date', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.movement' + '.last_direction', this.buildStateObject('direction of last movement', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.movement' + '.last_flap', this.buildStateObject('name of last used flap', 'value', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.movement' + '.last_flap_id', this.buildStateObject('id of last used flap', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.movement' + '.times_outside', this.buildStateObject('number of times outside today', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.movement' + '.time_spent_outside', this.buildStateObject('time spent in seconds outside today', 'value', 'number')));
						});
					}
					if (this.hasFeeder) {
						this.setObjectNotExists(objName + '.food', this.buildFolderObject('food'), () => {
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.food' + '.last_time_eaten', this.buildStateObject('last time food consumed', 'date', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.food' + '.times_eaten', this.buildStateObject('number of times food consumed today', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(objName + '.food' + '.time_spent', this.buildStateObject('time spent in seconds at feeder today', 'value', 'number')));

							this.setObjectNotExists(objName + '.food.wet', this.buildFolderObject('wet food (1)'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(objName + '.food.wet' + '.weight', this.buildStateObject('wet food consumed today', 'value', 'number')));

								this.setObjectNotExists(objName + '.food.dry', this.buildFolderObject('dry food (2)'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(objName + '.food.dry' + '.weight', this.buildStateObject('dry food consumed today', 'value', 'number')));

									if (this.hasDispenser) {
										this.setObjectNotExists(objName + '.water', this.buildFolderObject('water'), () => {
											promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.last_time_drunk', this.buildStateObject('last time water consumed', 'date', 'string')));
											promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.times_drunk', this.buildStateObject('number of times water consumed today', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.time_spent', this.buildStateObject('time spent in seconds at water dispenser today', 'value', 'number')));
											promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.weight', this.buildStateObject('water consumed today', 'value', 'number')));

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
							this.setObjectNotExists(objName + '.water', this.buildFolderObject('water'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.last_time_drunk', this.buildStateObject('last time water consumed', 'date', 'string')));
								promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.times_drunk', this.buildStateObject('number of times water consumed today', 'value', 'number')));
								promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.time_spent', this.buildStateObject('time spent in seconds at water dispenser today', 'value', 'number')));
								promiseArray.push(this.setObjectNotExistsPromise(objName + '.water' + '.weight', this.buildStateObject('water consumed today', 'value', 'number')));

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
	 * compares to version strings in format patch.major.minor
	 *
	 * @param version a version string
	 * @param lessThan a version string
	 * @return {boolean} true, if version is less than lessThan, false otherwise
	 */
	isVersionLessThan(version, lessThan) {
		if (version === undefined || version === null || version === 'unknown' || version.split('.').length < 3) {
			return false;
		}
		if (lessThan === undefined || lessThan === null || lessThan === 'unknown' || lessThan.split('.').length < 3) {
			return false;
		}
		if (version === lessThan) {
			return false;
		}
		const versionObj = version.split('.');
		const lessThanObj = lessThan.split('.');
		return parseInt(versionObj[0]) < parseInt(lessThanObj[0]) ||
			(versionObj[0] === lessThanObj[0] && parseInt(versionObj[1]) < parseInt(lessThanObj[1])) ||
			(versionObj[0] === lessThanObj[0] && versionObj[1] === lessThanObj[1] && parseInt(versionObj[2]) < parseInt(lessThanObj[2]));
	}

	/**
	 * determines offline devices
	 */
	getOfflineDevices() {
		this.log.silly(`setting offline devices`);

		if (this.allDevicesOnline !== undefined) {
			this.allDevicesOnlinePrev = this.allDevicesOnline;
		}
		this.offlineDevicesPrev = this.offlineDevices;

		this.allDevicesOnline = true;
		this.offlineDevices = [];
		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;

			for (let d = 0; d < this.devices[hid].length; d++) {
				this.allDevicesOnline = this.allDevicesOnline && this.devices[hid][d].status.online;
				if (!this.devices[hid][d].status.online) {
					this.offlineDevices.push(this.devices[hid][d].name);
				}
			}
		}
	}

	/**
	 * sets the battery percentage from the battery value
	 */
	calculateBatteryPercentageForDevices() {
		this.log.silly(`calculating battery percentages for devices`);

		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;

			for (let d = 0; d < this.devices[hid].length; d++) {
				if (this.devices[hid][d].status.battery) {
					this.devices[hid][d].status.battery_percentage = this.calculateBatteryPercentage(this.devices[hid][d].product_id, this.devices[hid][d].status.battery);
				}
			}
		}
	}

	/**
	 * determines device types
	 */
	getConnectedDeviceTypes() {
		if (this.firstLoop) {
			this.log.silly(`setting connected device types`);

			for (let h = 0; h < this.households.length; h++) {
				const hid = this.households[h].id;

				for (let d = 0; d < this.devices[hid].length; d++) {
					switch (this.devices[hid][d].product_id) {
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
	}

	/**
	 * calculates last movement for pet
	 *
	 * @param {string} petName
	 * @param {number} hid a household id
	 * @returns {object} last used flap data object
	 */
	calculateLastMovement(petName, hid) {
		const data = {};
		if (Array.isArray(this.history[hid])) {
			for (let i = 0; i < this.history[hid].length; i++) {
				const datapoint = this.history[hid][i];
				if ('type' in datapoint && datapoint.type === 0) {
					if ('pets' in datapoint && Array.isArray(datapoint.pets) && datapoint.pets.length > 0) {
						for (let p = 0; p < datapoint.pets.length; p++) {
							if ('name' in datapoint.pets[p] && petName === datapoint.pets[p].name) {
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
	 * calculates last movement for unknown pet
	 *
	 * @param {number} hid a household id
	 * @returns {object} last used flap data object
	 */
	calculateLastMovementForUnknownPet(hid) {
		const data = {};
		if (Array.isArray(this.history[hid])) {
			for (let i = 0; i < this.history[hid].length; i++) {
				const datapoint = this.history[hid][i];
				if ('type' in datapoint && datapoint.type === 0) {
					if ('movements' in datapoint && Array.isArray(datapoint.movements) && datapoint.movements.length > 0) {
						if (!('pets' in datapoint) && !('tag_id' in datapoint.movements && datapoint.movements.tag_id !== 0)) {
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
		for (let i = 0; i < this.report[pet].movement.datapoints.length; i++) {
			const datapoint = this.report[pet].movement.datapoints[i];
			if ('from' in datapoint && 'to' in datapoint) {
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
		for (let i = 0; i < this.report[pet].feeding.datapoints.length; i++) {
			const datapoint = this.report[pet].feeding.datapoints[i];
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
		for (let i = 0; i < this.report[pet].drinking.datapoints.length; i++) {
			const datapoint = this.report[pet].drinking.datapoints[i];
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
	 * @returns {*[]|undefined} a curfew object if parsing and validation was successful, undefined otherwise
	 */
	validateAndGetCurfewFromJsonString(jsonString, device_type) {
		try {
			const jsonObject = JSON.parse(jsonString);

			if (!Array.isArray(jsonObject) || jsonObject.length === 0) {
				this.log.error(`could not set new curfew because: JSON does not contain an array or array is empty`);
				return undefined;
			}
			if (DEVICE_TYPE_CAT_FLAP === device_type && jsonObject.length > 4) {
				this.log.error(`could not set new curfew because: cat flap does not support more than 4 curfew times`);
				return undefined;
			}
			if (DEVICE_TYPE_PET_FLAP === device_type && jsonObject.length > 1) {
				this.log.error(`could not set new curfew because: pet flap does not support more than 1 curfew time`);
				return undefined;
			}
			if (!this.arrayContainsCurfewAttributes(jsonObject)) {
				this.log.error(`could not set new curfew because: JSON array does not contain lock_time and unlock_time in format HH:MM`);
				return undefined;
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
			return undefined;
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
		const currentDate = new Date();
		const currentHour = currentDate.getHours();
		const currentMinutes = currentDate.getMinutes();
		for (let h = 0; h < curfew.length; h++) {
			if ('enabled' in curfew[h] && curfew[h]['enabled'] && 'lock_time' in curfew[h] && 'unlock_time' in curfew[h]) {
				const start = curfew[h]['lock_time'].split(':');
				const end = curfew[h]['unlock_time'].split(':');
				const startHour = parseInt(start[0]);
				const startMinutes = parseInt(start[1]);
				const endHour = parseInt(end[0]);
				const endMinutes = parseInt(end[1]);
				//this.log.debug(`curfew ${h} start ${startHour}:${startMinutes} end ${endHour}:${endMinutes} current ${currentHour}:${currentMinutes}`);
				if (startHour < endHour || (startHour === endHour && startMinutes < endMinutes)) {
					// current time must be between start and end
					if (startHour < currentHour || (startHour === currentHour && startMinutes <= currentMinutes)) {
						if (endHour > currentHour || (endHour === currentHour && endMinutes > currentMinutes)) {
							return true;
						}
					}
				} else {
					// current time must be after start or before end
					if (startHour < currentHour || (startHour === currentHour && startMinutes <= currentMinutes)) {
						return true;
					} else if (endHour > currentHour || (endHour === currentHour && endMinutes > currentMinutes)) {
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
	 * @param {string} objName
	 * @return {Promise} Promise of an adapter state value
	 */
	getStateValueFromAdapter(objName) {
		return new Promise((resolve, reject) => {
			this.getState(objName, (err, obj) => {
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
	 * @param {number} hid a household id
	 * @param {number} deviceIndex
	 * @param {number} tag
	 * @return {number} tag index
	 */
	getTagIndexForDeviceIndex(hid, deviceIndex, tag) {
		if ('tags' in this.devices[hid][deviceIndex]) {
			for (let t = 0; t < this.devices[hid][deviceIndex].tags.length; t++) {
				if (this.devices[hid][deviceIndex].tags[t].id === tag) {
					return t;
				}
			}
		}
		return -1;
	}

	/**
	 * returns the device id of the device
	 *
	 * @param {string} name name of the device
	 * @param {Array} deviceTypes allowed device types
	 * @return {number} device id
	 */
	getDeviceId(name, deviceTypes) {
		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;

			for (let i = 0; i < this.devices[hid].length; i++) {
				if (this.devices[hid][i].name === name && (deviceTypes.length === 0 || deviceTypes.includes(this.devices[hid][i].product_id))) {
					return this.devices[hid][i].id;
				}
			}
		}
		return -1;
	}

	/**
	 * returns the device index
	 *
	 * @param {string} name
	 * @param {Array} deviceTypes allowed device types
	 * @return {Object|undefined} device index and household id
	 */
	getDeviceIndexAndHouseholdId(name, deviceTypes) {
		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;

			for (let d = 0; d < this.devices[hid].length; d++) {
				if (this.devices[hid][d].name === name && (deviceTypes.length === 0 || deviceTypes.includes(this.devices[hid][d].product_id))) {
					const device = {};
					device.index = d;
					device.householdId = hid;
					return device;
				}
			}
		}
		return undefined;
	}

	/**
	 * returns the device type of the device
	 *
	 * @param {string} name
	 * @param {Array} deviceTypes allowed device types
	 * @return {number} device type
	 */
	getDeviceTypeByDeviceName(name, deviceTypes) {
		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;

			for (let i = 0; i < this.devices[hid].length; i++) {
				if (this.devices[hid][i].name === name && deviceTypes.includes(this.devices[hid][i].product_id)) {
					return this.devices[hid][i].product_id;
				}
			}
		}
		return -1;
	}

	/**
	 * returns the device with the given id
	 *
	 * @param {string} id
	 * @return {object|undefined} device
	 */
	getDeviceById(id) {
		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;

			for (let i = 0; i < this.devices[hid].length; i++) {
				if (this.devices[hid][i].id === id) {
					return this.devices[hid][i];
				}
			}
		}
		return undefined;
	}

	/**
	 * Returns whether the given tag array contains the given tag id.
	 *
	 * @param {Array} tags
	 * @param {number} tag_id
	 * @return {boolean}
	 */
	doesTagsArrayContainTagId(tags, tag_id) {
		if (tags !== undefined && Array.isArray(tags) && tag_id !== undefined) {
			for (let t = 0; t < tags.length; t++) {
				if (tags[t].id === tag_id) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * returns the pet id of the pet
	 *
	 * @param {string} name
	 * @return {number} pet id
	 */
	getPetId(name) {
		for (let i = 0; i < this.pets.length; i++) {
			if (this.pets[i].name === name) {
				return this.pets[i].id;
			}
		}
		return -1;
	}

	/**
	 * returns the tag id of the pet
	 *
	 * @param {string} name
	 * @return {number} tag id
	 */
	getPetTagId(name) {
		for (let i = 0; i < this.pets.length; i++) {
			if (this.pets[i].name === name) {
				return this.pets[i].tag_id;
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
		for (let i = 0; i < this.pets.length; i++) {
			if (this.pets[i].name === name) {
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
		for (let i = 0; i < this.pets.length; i++) {
			if (this.pets[i].tag_id === tag_id) {
				return this.pets[i].id;
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
		for (let i = 0; i < this.pets.length; i++) {
			if (this.pets[i].tag_id === tag_id) {
				return this.pets[i].name;
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
		for (let i = 0; i < this.pets.length; i++) {
			if (this.pets[i].tag_id === tag_id) {
				return this.pets[i].name_org;
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
		for (let i = 0; i < this.households.length; i++) {
			if (this.households[i].id === id) {
				return this.households[i].name;
			}
		}
		return undefined;
	}

	/**
	 * normalizes lockmode by changing lockmode 4 to 0
	 * Cat flap has 4 lockmodes, pet flap has 5 lockmodes (extra mode for curfew)
	 * Since control should be the same for both flaps, lockmode 4 is removed
	 * and curfew is controlled via control.curfew_enabled
	 */
	normalizeLockMode() {
		this.log.silly(`normalizing lock mode`);

		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;
			for (let d = 0; d < this.devices[hid].length; d++) {
				if ('locking' in this.devices[hid][d].status && 'mode' in this.devices[hid][d].status.locking) {
					if (this.devices[hid][d].status.locking.mode === 4) {
						this.devices[hid][d].status.locking.mode = 0;
					}
				}
			}
		}
	}

	/**
	 * checks every flap and makes the curfew an array if it's not
	 * additional the times are converted from UTC to local time
	 */
	normalizeCurfew() {
		this.log.silly(`normalizing curfew`);

		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;
			for (let d = 0; d < this.devices[hid].length; d++) {
				if ([DEVICE_TYPE_CAT_FLAP, DEVICE_TYPE_PET_FLAP].includes(this.devices[hid][d].product_id)) {
					if ('curfew' in this.devices[hid][d].control) {
						if (!Array.isArray(this.devices[hid][d].control.curfew)) {
							this.devices[hid][d].control.curfew = [this.devices[hid][d].control.curfew];
						}
						this.devices[hid][d].control.curfew = this.convertCurfewUtcTimesToLocalTimes(this.devices[hid][d].control.curfew);
					} else {
						this.devices[hid][d].control.curfew = [];
					}
				}
			}
		}
	}

	/**
	 * converts all lock and unlock times in the given curfew from UTC to local time
	 *
	 * @param {Array} curfew a curfew with UTC times
	 * @return {Array} a curfew with local times
	 */
	convertCurfewUtcTimesToLocalTimes(curfew) {
		if (Array.isArray(curfew)) {
			for (let c = 0; c < curfew.length; c++) {
				if ('lock_time' in curfew[c] && 'unlock_time' in curfew[c]) {
					curfew[c].lock_time = this.convertUtcTimeToLocalTime(curfew[c].lock_time);
					curfew[c].unlock_time = this.convertUtcTimeToLocalTime(curfew[c].unlock_time);
				}
			}
		}
		return curfew;
	}

	/**
	 * converts all lock and unlock times in the given curfew from local time to UTC
	 *
	 * @param {Array} curfew a curfew with local times
	 * @return {Array} a curfew with UTC times
	 */
	convertCurfewLocalTimesToUtcTimes(curfew) {
		if (Array.isArray(curfew)) {
			for (let c = 0; c < curfew.length; c++) {
				if ('lock_time' in curfew[c] && 'unlock_time' in curfew[c]) {
					curfew[c].lock_time = this.convertLocalTimeToUtcTime(curfew[c].lock_time);
					curfew[c].unlock_time = this.convertLocalTimeToUtcTime(curfew[c].unlock_time);
				}
			}
		}
		return curfew;
	}

	/**
	 * applies a smooth filter to flatten outliers in battery values
	 */
	smoothBatteryOutliers() {
		this.log.silly(`smoothing battery outliers`);

		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;
			if (this.devicesPrev[hid]) {
				for (let d = 0; d < this.devices[hid].length; d++) {
					if (this.devices[hid][d].status.battery) {
						if (this.devices[hid][d].status.battery > this.devicesPrev[hid][d].status.battery) {
							this.devices[hid][d].status.battery = Math.ceil(this.devices[hid][d].status.battery * 10 + this.devicesPrev[hid][d].status.battery * 990) / 1000;
						} else if (this.devices[hid][d].status.battery < this.devicesPrev[hid][d].status.battery) {
							this.devices[hid][d].status.battery = Math.floor(this.devices[hid][d].status.battery * 10 + this.devicesPrev[hid][d].status.battery * 990) / 1000;
						}
					}
				}
			}
		}
	}

	/**
	 * removes whitespaces and special characters from household names
	 */
	normalizeHouseholdNames() {
		const reg = /\W/ig;
		const rep = '_';

		this.log.silly(`normalizing household names`);

		for (let h = 0; h < this.households.length; h++) {
			if (this.households[h].name) {
				this.households[h].name_org = this.households[h].name;
				this.households[h].name = this.households[h].name_org.replace(reg, rep);
			}
		}
	}

	/**
	 * removes whitespaces and special characters from device names
	 */
	normalizeDeviceNames() {
		const reg = /\W/ig;
		const rep = '_';

		this.log.silly(`normalizing device names`);

		for (let h = 0; h < this.households.length; h++) {
			const hid = this.households[h].id;
			for (let d = 0; d < this.devices[hid].length; d++) {
				if (this.devices[hid][d].name) {
					this.devices[hid][d].name_org = this.devices[hid][d].name;
					this.devices[hid][d].name = this.devices[hid][d].name_org.replace(reg, rep);
				}
				if (this.devices[hid][d].parent && this.devices[hid][d].parent.name) {
					this.devices[hid][d].parent.name_org = this.devices[hid][d].parent.name;
					this.devices[hid][d].parent.name = this.devices[hid][d].parent.name_org.replace(reg, rep);
				}
			}
		}
	}

	/**
	 * removes whitespaces and special characters from pet names
	 */
	normalizePetNames() {
		const reg = /\W/ig;
		const rep = '_';

		this.log.silly(`normalizing pet names`);

		for (let p = 0; p < this.pets.length; p++) {
			if (this.pets[p].name) {
				this.pets[p].name_org = this.pets[p].name;
				this.pets[p].name = this.pets[p].name_org.replace(reg, rep);
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
		return idArray.length > 5 && (idArray[idArray.length - 2] === 'control' || (idArray[idArray.length - 4] === 'control' && idArray[idArray.length - 3] === 'pets'));
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
	 * Returns whether the array of ids is a pet assigment
	 *
	 * @param {Array} idArray an array of ids
	 * @returns true, if it is a pet assigment id, false otherwise
	 */
	isPetAssigment(idArray) {
		return idArray.length > 7 && idArray[idArray.length - 4] === 'control' && idArray[idArray.length - 3] === 'pets' && idArray[idArray.length - 1] === 'assigned';
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
		const timeParts = time.split(':');
		if (timeParts.length === 2) {
			const time = new Date();
			time.setUTCHours(parseInt(timeParts[0]));
			time.setUTCMinutes(parseInt(timeParts[1]));
			return time.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false});
		} else {
			return time;
		}
	}

	/**
	 * Converts a HH:MM time string from local time to UTC time
	 *
	 * @param {string} time a time in format HH:MM
	 * @returns {string} a time in format HH:MM
	 */
	convertLocalTimeToUtcTime(time) {
		const timeParts = time.split(':');
		if (timeParts.length === 2) {
			const time = new Date();
			time.setHours(parseInt(timeParts[0]));
			time.setMinutes(parseInt(timeParts[1]));
			return time.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false});
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
		this.log.info(`checking adapter configuration...`);
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
		this.log.info('json history enabled: ' + this.config.history_json_enable);
		if (this.config.history_json_enable === true) {
			this.log.info('number of json history entries: ' + this.config.history_json_entries);
		}
		this.log.info('history (deprecated) enabled: ' + this.config.history_enable);
		if (this.config.history_enable === true) {
			this.log.info('number of history (deprecated) entries: ' + this.config.history_entries);
		}
		this.log.info('last movement for unknown pet enabled: ' + this.config.unknown_movement_enable);
		if (configOk) {
			this.log.info('adapter configuration ok');
		} else {
			this.log.info('adapter configuration contains errors');
		}
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
