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

// Constants - data update frequency
const RETRY_FREQUENCY_LOGIN = 60;
const UPDATE_FREQUENCY_DATA = 10;
const UPDATE_FREQUENCY_HISTORY = 60;
const UPDATE_FREQUENCY_REPORT = 60;
// Constants - device types
const DEVICE_TYPE_PET_FLAP = 3;
const DEVICE_TYPE_FEEDER = 4;
const DEVICE_TYPE_CAT_FLAP = 6;
// Constants - feeder parameter
const FEEDER_SINGLE_BOWL = 1;
const FEEDER_FOOD_WET = 1;
const FEEDER_FOOD_DRY = 2;

class Sureflap extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sureflap',
		});

		// class variables

		// number of logins
		this.numberOfLogins = 0;
		// timer id
		this.timerId = 0;
		// adapter unloaded
		this.adapterUnloaded = false;
		// flap connected to hub
		this.hasFlap = false;
		// feeder connected to hub
		this.hasFeeder = false;
		// water dispenser connected to hub
		this.hasDispenser = false;
		// is first update loop
		this.firstLoop = true;
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

		// remember repeatbale warnings to not spam iobroker log
		this.petPositionObjectMissing = [];
		this.petFeedingDataMissing = [];
		this.feederConfigBowlObjectMissing = [];
		this.feederFoodBowlObjectMissing = [];

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

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		//this.log.info("config option1: " + this.config.option1);
		//this.log.info("config option2: " + this.config.option2);

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates("lights.*");
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates("*");
		this.subscribeStates('*');

		// start loading the data from the surepetcare API
		this.startLoadingData();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
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
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		// desired value is set
		if(id && state && state.ack === false) {
			const l = id.split('.');
			if ((l.length > 6) && l[l.length - 2] == 'control' && (l[l.length - 1] == 'curfew' || l[l.length - 1] == 'lockmode' || l[l.length - 1] == 'type') ) {
				// change in control section of sureflap
				const hierarchy = l.slice(2,l.length-2).join('.');
				const device = l[4];
				const control = l[l.length - 1];

				if(control === 'curfew') {
					this.changeCurfew(hierarchy, device, state.val === true);
				} else if(control === 'lockmode' && typeof(state.val) === 'number') {
					this.changeLockmode(hierarchy, device, state.val);
				} else if(control === 'type' && typeof(state.val) === 'number') {
					const tag_id = this.getPetTagId(l[l.length - 3]);
					this.changePetType(hierarchy, device, tag_id, state.val);
				}
				return;
			} else if ((l.length > 6) && l[l.length - 2] == 'control' && l[l.length - 1] == 'close_delay' ) {
				// change in control section of feeder
				const hierarchy = l.slice(2,l.length-2).join('.');
				const device = l[4];
				const control = l[l.length - 1];

				if(control === 'close_delay' && typeof(state.val) === 'number') {
					this.changeCloseDelay(hierarchy, device, state.val);
				}
				return;
			} else if ((l.length > 5) && l[l.length-2] == 'control' && l[l.length-1] == 'led_mode') {
				// change hub led mode
				const hierarchy = l.slice(2,l.length-3).join('.');
				const hub = l[l.length-3];
				this.changeHubLedMode(hierarchy, hub, Number(state.val));
				return;
			} else if ((l.length > 4) && l[l.length - 3] == 'pets' && l[l.length - 1] == 'inside') {
				// change of pet location
				const hierarchy = l.slice(2,l.length-3).join('.');
				const pet = l[l.length-2];
				this.changePetLocation(hierarchy, pet, state.val === true);
				return;
			} else {
				// TODO implement changing curfew times
				this.log.warn(`not allowed to change object ${id}`);
				return;
			}
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	/*************************************************
	 * methods to start and keep update loop running *
	 *************************************************/

	/**
	 * starts loading data from the surepet API
	 */
	startLoadingData() {
		this.log.debug(`starting SureFlap Adapter v1.1.1`);
		clearTimeout(this.timerId);
		this.doAuthenticate()
			.then(() => this.startUpdateLoop())
			.catch(error => {
				this.log.error(error);
				this.log.info(`disconnected`);
				if(!this.adapterUnloaded) {
					// @ts-ignore
					this.timerId = setTimeout(this.startLoadingData.bind(this), UPDATE_FREQUENCY_DATA*1000);
				}
			});
	}

	/**
	 * does the authentication with the surepetcare API
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
	 * @return {Promise}
	 */
	startUpdateLoop() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.log.info(`starting update loop...`);
			this.firstLoop=true;
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
			.then(() => this.getAdditionalDataFromApi())
			.then(() => this.createAdapterObjectHierarchy())
			.then(() => this.getDeviceStatusFromData())
			.then(() => this.getPetStatusFromData())
			.then(() => this.getEventHistoryFromData())
			.then(() => this.setUpdateTimer())
			.catch(error => {
				this.log.error(error);
				this.log.info(`update loop stopped`);
				this.log.info(`disconnected`);
				if(!this.adapterUnloaded) {
					// @ts-ignore
					this.timerId = setTimeout(this.startLoadingData.bind(this), RETRY_FREQUENCY_LOGIN*1000);
				}
			})
			.finally(() => {this.firstLoop=false;});
	}

	/**
	 * sets the update timer
	 * @return {Promise}
	 */
	setUpdateTimer() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if(!this.adapterUnloaded) {
				// @ts-ignore
				this.timerId = setTimeout(this.updateLoop.bind(this), UPDATE_FREQUENCY_DATA*1000);
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
	 * @return {Promise} Promise of an auth token
	 */
	doLoginViaApi() {
		return new Promise((resolve, reject) => {
			const postData = JSON.stringify( this.buildLoginJsonData() );
			const options = this.buildOptions('/api/auth/login', 'POST', '');
			this.sureFlapState = {};
			this.numberOfLogins++;
			this.log.info(`connecting...`);
			this.log.debug(`email_address: ${this.buildLoginJsonData().email_address}`);
			this.log.debug(`password: ${this.buildLoginJsonData().password}`);
			this.log.debug(`json: ${postData}`);
			this.log.debug(`login count: ${this.numberOfLogins}`);
			this.httpRequest('login', options, postData).then(result => {
				if (result == undefined || result.data == undefined || !('token' in result.data)) {
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
	 * gets the data for devices and pets from surepet API
	 * @return {Promise}
	 */
	getDataFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/me/start', 'GET', this.sureFlapState['token']);
			this.httpRequest('get_data', options, '').then(result => {
				if (result == undefined || result.data == undefined) {
					return reject(new Error(`getting data failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
				} else {
					this.sureFlapStatePrev = JSON.parse(JSON.stringify(this.sureFlapState));
					this.sureFlapState.devices = result.data.devices;
					this.sureFlapState.households = result.data.households;
					this.sureFlapState.pets = result.data.pets;
					this.makeNamesCanonical();
					this.makeCurfewArray();
					this.normalizeLockMode();
					this.setOfflineDevices();
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
	 * gets additional data for history and reports from surepet API
	 * @return {Promise}
	 */
	getAdditionalDataFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];

			this.updateHistory = false;
			this.updateReport = false;

			// get history every UPDATE_FREQUENCY_HISTORY
			if(this.lastHistoryUpdate + UPDATE_FREQUENCY_HISTORY * 1000 < Date.now()) {
				promiseArray.push(this.getEventHistoryFromApi());
			}
			// get aggregated report every UPDATE_FREQUENCY_REPORT but not same time as history (dont spam surepet server) except for first loop
			if((!this.updateHistory || this.firstLoop) && this.hasFeeder && this.lastReportUpdate + UPDATE_FREQUENCY_REPORT * 1000 < Date.now()) {
				promiseArray.push(this.getAggregatedReportFromApi());
			}
			if(promiseArray.length == 0) {
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
	 * @return {Promise}
	 */
	getEventHistoryFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.lastHistoryUpdate = Date.now();
			const promiseArray = [];
			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				promiseArray.push(this.getEventHistoryForHouseholdFromApi(this.sureFlapState.households[h].id));
			}
			Promise.all(promiseArray).then((values) => {
				for(let h = 0; h < this.sureFlapState.households.length; h++) {
					if (values[h] == undefined) {
						return reject(new Error(`getting history failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
					} else {
						if(this.sureFlapHistory[h] !== undefined) {
							this.sureFlapHistoryPrev[h] = JSON.parse(JSON.stringify(this.sureFlapHistory[h]));
						}
						this.sureFlapHistory[h] = values[h];
					}
				}
				this.updateHistory = true;
				return resolve();
			}).catch(err => {
				return reject(err);
			});
		}));
	}

	/**
	 * gets the event history from surepet API for the household with id
	 * @param {Number} id
	 * @return {Promise} of a JSon object
	 */
	getEventHistoryForHouseholdFromApi(id) {
		return (new Promise((resolve, reject) => {
			//const promiseArray = [];
			let options = this.buildOptions('/api/timeline/household/' + id, 'GET', this.sureFlapState['token']);
			this.httpRequest('get_history', options, '').then(result => {
				if (result == undefined || result.data == undefined) {
					return reject(new Error(`getting history failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
				} else {
					if(result.data.length == 0 || result.data[0].id == undefined) {
						return resolve(result.data);
					} else {
						options = this.buildOptions('/api/timeline/household/' + id + '?since_id=' + result.data[0].id + '&page_size=1000', 'GET', this.sureFlapState['token']);
						this.httpRequest('get_history_since', options, '').then(sinceResult => {
							if (sinceResult == undefined) {
								return reject(new Error(`getting additional history failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
							} else {
								if(sinceResult.data == undefined || sinceResult.data.length == 0) {
									return resolve(result.data);
								} else {
									const data = [...sinceResult.data,...result.data];
									return resolve(data.length > 25 ? data.slice(0,25) : data);
								}
							}
						}).catch(err => {
							return reject(err);
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
	 * @return {Promise}
	 */
	getAggregatedReportFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.lastReportUpdate = Date.now();
			const promiseArray = [];
			for(let p = 0; p < this.sureFlapState.pets.length; p++) {
				promiseArray.push(this.getReportForHouseholdAndPetFromApi(this.sureFlapState.pets[p].household_id, this.sureFlapState.pets[p].id));
			}
			Promise.all(promiseArray).then((values) => {
				for(let p = 0; p < this.sureFlapState.pets.length; p++) {
					if (values[p] == undefined) {
						return reject(new Error(`getting report data for pet '${this.sureFlapState.pets[p].name}' failed. retrying login in ${RETRY_FREQUENCY_LOGIN} seconds`));
					} else {
						if(this.sureFlapReport[p] !== undefined) {
							this.sureFlapReportPrev[p] = JSON.parse(JSON.stringify(this.sureFlapReport[p]));
						}
						this.sureFlapReport[p] = values[p];
					}
				}
				this.updateReport = true;
				return resolve();
			}).catch(err => {
				return reject(err);
			});
		}));
	}

	/**
	 * gets the aggregeated report from surepet API for the household with household_id and pet with pet_id
	 * @param {Number} household_id
	 * @param {Number} pet_id
	 * @return {Promise} of a JSon object
	 */
	getReportForHouseholdAndPetFromApi(household_id, pet_id) {
		return (new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/report/household/' + household_id + '/pet/' + pet_id + '/aggregate', 'GET', this.sureFlapState['token']);
			this.httpRequest('get_report', options, '').then(result => {
				if (result == undefined || result.data == undefined) {
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
	 * @return {Promise}
	 */
	getDeviceStatusFromData() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.setGlobalOnlineStatusToAdapter();

			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				for(let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id ==  this.sureFlapState.households[h].id) {
						if ('parent' in this.sureFlapState.devices[d]) {
							const hierarchy = '.' + this.sureFlapState.devices[d].parent.name;

							if (this.sureFlapState.devices[d].product_id == DEVICE_TYPE_PET_FLAP || this.sureFlapState.devices[d].product_id == DEVICE_TYPE_CAT_FLAP) {
								// Sureflap Connect
								this.setSureflapConnectToAdapter(prefix,hierarchy,d,this.sureFlapState.devices[d].product_id == DEVICE_TYPE_CAT_FLAP);
							} else if (this.sureFlapState.devices[d].product_id == DEVICE_TYPE_FEEDER) {
								// Feeder Connect
								this.setFeederConnectToAdapter(prefix,hierarchy,d);
							}
							// TODO: add water dispenser
							this.setBatteryStatusToAdapter(prefix,hierarchy,d);
						} else {
							this.setHubStatusToAdapter(prefix,d);
						}
						this.setOnlineStatusToAdapter(prefix,d);
					}
				}
			}
			return resolve();
		}));
	}

	/**
	 * gets the pets from surepet state object
	 * @return {Promise}
	 */
	getPetStatusFromData() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const numPets = this.sureFlapState.pets.length;

			for (let p = 0; p < numPets; p++) {
				const pet_name = this.sureFlapState.pets[p].name;
				const household_name = this.getHouseholdNameForId(this.sureFlapState.pets[p].household_id);
				const prefix = household_name + '.pets';
				if(this.hasFlap) {
					if('position' in this.sureFlapState.pets[p]) {
						const where = this.sureFlapState.pets[p].position.where;
						const since = this.sureFlapState.pets[p].position.since;
						this.setPetStatusWithPositionToAdapter(prefix, pet_name, where, since, p);
						this.petPositionObjectMissing[p] = false;
					} else {
						this.setPetStatusToAdapter(prefix, pet_name, p);
						if(!this.petPositionObjectMissing[p]) {
							this.log.warn(`no position object found for pet '${this.sureFlapState.pets[p].name}'`);
							this.petPositionObjectMissing[p] = true;
						}
					}
					// add time spent outside and number of entries
				} else {
					this.setPetStatusToAdapter(prefix, pet_name, p);
				}
				if(this.hasFeeder && this.updateReport) {
					this.setPetFeedingToAdapter(prefix + '.' + pet_name + '.food', p);
				}
			}
			return resolve();
		}));
	}

	/**
	 * gets the history from surepet history object
	 * @return {Promise}
	 */
	getEventHistoryFromData() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			if(this.updateHistory) {
				for(let h = 0; h < this.sureFlapState.households.length; h++) {
					const prefix = this.sureFlapState.households[h].name;

					if(this.sureFlapHistoryPrev[h] == undefined || JSON.stringify(this.sureFlapHistory[h]) !== JSON.stringify(this.sureFlapHistoryPrev[h])) {
						this.log.debug(`updating event history for household '${prefix}'`);
						/* structure of history changes, so we need to delete and recreate history event structure on change */
						this.deleteEventHistoryForHousehold(h).then(() => {
							if(this.sureFlapHistory.length > h) {
								this.log.debug(`updating event history with ${this.sureFlapHistory[h].length} events`);
								for(let i = 0; i < this.sureFlapHistory[h].length; i++) {
									this.setHistoryEventToAdapter(prefix,h,i);
								}
								return resolve();
							}
						}).catch(err => {
							this.log.error(`updating event history failed (${err})`);
							return resolve();
						});
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
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} value
	 */
	changeCloseDelay(hierarchy, device, value) {
		if(value != 0 && value != 4 && value != 20) {
			this.log.warn(`invalid value for close delay: ${value}`);
			this.resetControlCloseDelayToAdapter(hierarchy, device);
			return;
		}

		this.log.debug(`changing close delay to ${value}...`);
		this.setCloseDelay(device, value)
			.then(() => {
				this.log.info(`close delay changed to ${value}`);
			}).catch(err => {
				this.log.error(`changing close delay failed: ${err}`);
				this.resetControlCloseDelayToAdapter(hierarchy, device);
			});
	}

	/**
	 * changes the lockmode
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} value
	 */
	changeLockmode(hierarchy, device, value) {
		if(value < 0 || value > 3) {
			this.log.warn(`invalid value for lock mode: ${value}`);
			this.resetControlLockmodeToAdapter(hierarchy, device);
			return;
		}

		this.log.debug(`changing lock mode to ${value}...`);
		this.setLockmode(device, value)
			.then(() => {
				this.log.info(`lock mode changed to ${value}`);
			}).catch(err => {
				this.log.error(`changing lock mode failed: ${err}`);
				this.resetControlLockmodeToAdapter(hierarchy, device);
			});
	}

	/**
	 * changes the pet type (indoor or outdoor)
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} tag
	 * @param {number} value
	 */
	changePetType(hierarchy, device, tag, value) {
		if(value < 2 || value > 3) {
			this.log.warn(`invalid value for pet type: ${value}`);
			this.resetControlPetTypeToAdapter(hierarchy, device, tag);
			return;
		}

		this.log.debug(`changing pet type to ${value}...`);
		this.setPetType(device, tag, value)
			.then(() => {
				this.log.info(`pet type changed to ${value}`);
			}).catch(err => {
				this.log.error(`changing pet type failed: ${err}`);
				this.resetControlPetTypeToAdapter(hierarchy, device, tag);
			});
	}

	/**
	 * switches the curfew on or off
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {boolean} value
	 */
	changeCurfew(hierarchy, device, value) {
		let current_state = false;
		const device_type = this.getDeviceType(device);
		const curfew_settings = hierarchy + '.curfew';
		this.getCurfewFromAdapter(curfew_settings).then(curfew => {
			current_state = this.isCurfewEnabled(curfew);
		}).finally(() => {
			this.log.debug(`control curfew old state: ${current_state} new state: ${value}`);
			if(current_state !== value) {
				if(value === true) {
					// enable curfew
					const obj_name =  hierarchy + '.last_curfew';
					this.getCurfewFromAdapter(obj_name).then(curfew => {
						if(curfew.length > 0) {
							if(DEVICE_TYPE_PET_FLAP === device_type) {
								// pet flap takes single object instead of array
								curfew = curfew[0];
								curfew.enabled = true;
							}
							const curfewJSON = JSON.stringify(curfew);
							this.log.debug(`setting curfew to: ${curfewJSON}`);
							this.setCurfew(device,curfew).then(() => {
								this.log.info(`curfew succesfully enabled`);
							}).catch(err => {
								this.log.error(`could not enable curfew because: ${err}`);
								this.resetControlCurfewToAdapter(hierarchy, device);
							});
						} else {
							this.log.error(`could not enable curfew because: last_curfew does not contain a curfew`);
							this.resetControlCurfewToAdapter(hierarchy, device);
						}
					}).catch(err => {
						this.log.error(`could not enable curfew because: ${err}`);
						this.resetControlCurfewToAdapter(hierarchy, device);
					});
				} else {
					// disable curfew
					const obj_name =  hierarchy + '.curfew';
					this.getCurfewFromAdapter(obj_name).then(curfew => {
						for(let h = 0; h < curfew.length; h++) {
							curfew[h].enabled = false;
						}
						if(DEVICE_TYPE_PET_FLAP === device_type) {
							// pet flap takes single object instead of array
							curfew = curfew[0];
						}
						this.log.debug('setting curfew to: ' + JSON.stringify(curfew));
						this.setCurfew(device,curfew).then(() => {
							this.log.info(`curfew succesfully disabled`);
						}).catch(err => {
							this.log.error(`could not disable curfew because: ${err}`);
							this.resetControlCurfewToAdapter(hierarchy, device);
						});
					}).catch(err => {
						this.log.error(`could not disable curfew because: ${err}`);
						this.resetControlCurfewToAdapter(hierarchy, device);
					});
				}
			}
		});
	}

	/**
	 * changes the pet location
	 * @param {string} hierarchy
	 * @param {string} pet
	 * @param {boolean} value
	 */
	changePetLocation(hierarchy, pet, value) {
		this.getStateValueFromAdapter(hierarchy + '.pets.' + pet + '.name').then(name => {
			this.setPetLocation(hierarchy, name, value).then(() => {
				this.log.info(`pet location succesfully set`);
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
	 * @param {string} hierarchy
	 * @param {string} hub
	 * @param {number} value
	 */
	changeHubLedMode(hierarchy, hub, value) {
		this.setHubLedMode(hierarchy, hub, value).then(() => {
			this.log.info(`hub led mode succesfully set`);
		}).catch(error => {
			this.log.error(`could not set hub led mode because: ${error}`);
			this.resetHubLedModeToAdapter(hierarchy, hub);
		});
	}

	/**
	 * sets the close delay
	 * @param {string} device
	 * @param {number} close_delay
	 * @return {Promise}
	 */
	setCloseDelay(device, close_delay) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device);
			const postData = JSON.stringify( {'lid': { 'close_delay':close_delay } } );
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
	 * @param {string} device
	 * @param {number} tag
	 * @param {number} type
	 * @return {Promise}
	 */
	setPetType(device, tag, type) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device);
			const postData = JSON.stringify( { 'profile':type } );
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
	 * @param {string} device
	 * @param {number} lockmode
	 * @return {Promise}
	 */
	setLockmode(device, lockmode) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device);
			const postData = JSON.stringify( { 'locking':lockmode } );
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
	 * @param {string} device
	 * @param {object} curfew
	 * @return {Promise}
	 */
	setCurfew(device, curfew) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device);
			const postData = JSON.stringify( { curfew } );
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
	 * @param {string} hierarchy
	 * @param {string} pet
	 * @param {boolean} value
	 * @return {Promise}
	 */
	setPetLocation(hierarchy, pet, value) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const pet_id = this.getPetId(pet);
			const postData = JSON.stringify( { 'where':(value ? '1' : '2'), 'since':this.getCurrentDateFormattedForSurepetApi() } );
			const options = this.buildOptions('/api/pet/' + pet_id + '/position', 'POST', this.sureFlapState['token']);

			this.httpRequest('set_pet_location', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets hub led mode
	 * @param {string} hierarchy
	 * @param {string} hub
	 * @param {number} value
	 * @return {Promise}
	 */
	setHubLedMode(hierarchy, hub, value) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const hub_id = this.getDeviceId(hub);
			const postData = JSON.stringify( { 'led_mode':value } );
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
	 * sets connection status to the adapter
	 * @param {boolean} connected
	 */
	setConnectionStatusToAdapter(connected) {
		/* objects created via io-package.json, no need to create them here
		this.setObjectNotExists('info', this.buildChannelObject('Information'));
		this.setObjectNotExists('info.connection', this.buildStateObject('If connected to surepetcare api', 'indicator.connected'));
		*/
		this.setState('info.connection', connected, true);
	}

	/**
	 * sets global online status to the adapter
	 */
	setGlobalOnlineStatusToAdapter() {
		// all devices online status
		if (!this.sureFlapStatePrev.all_devices_online || (this.sureFlapState.all_devices_online !== this.sureFlapStatePrev.all_devices_online)) {
			const obj_name = 'info.all_devices_online';
			/* objects created via io-package.json, no need to create them here
			this.setObjectNotExists('info', this.buildChannelObject('Information'));
			this.setObjectNotExists(obj_name, this.buildStateObject('If all devices are online','indicator.reachable'));
			*/
			this.setState(obj_name, this.sureFlapState.all_devices_online, true);
		}
	}

	/**
	 * sets the last time data was recieved from surepet api
	 */
	setLastUpdateToAdapter() {
		/* object created via io-package.json, no need to create them here
		this.setObjectNotExists('info.last_update', this.buildStateObject('Last time data recieved from surepetcare api', 'date','string'));
		*/
		this.setState('info.last_update', this.getCurrentDateFormattedAsISO(), true);
	}


	/**
	 * sets sureflap attributes to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 * @param {boolean} isCatFlap
	 */
	setSureflapConnectToAdapter(prefix, hierarchy, deviceIndex, isCatFlap) {
		// lock mode
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.locking.mode !== this.sureFlapStatePrev.devices[deviceIndex].status.locking.mode)) {
			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.lockmode';
			try {
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.locking.mode, true);
			} catch(error) {
				this.log.error(`could not set lock mode to adapter (${error})`);
			}
		}

		// curfew
		if (!this.sureFlapStatePrev.devices || (JSON.stringify(this.sureFlapState.devices[deviceIndex].control.curfew) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].control.curfew))) {
			if(this.sureFlapStatePrev.devices && this.sureFlapStatePrev.devices[deviceIndex].control.curfew) {
				this.setCurfewToAdapter(prefix, hierarchy, deviceIndex, this.sureFlapStatePrev, 'last_curfew');
			}

			this.setCurfewToAdapter(prefix, hierarchy, deviceIndex, this.sureFlapState, 'curfew');

			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.curfew';
			try {
				this.setState(obj_name, this.isCurfewEnabled(this.sureFlapState.devices[deviceIndex].control.curfew), true);
			} catch(error) {
				this.log.error(`could not set curfew to adapter (${error})`);
			}
		}

		const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.curfew_active';
		try {
			const new_val = this.isCurfewActive(this.sureFlapState.devices[deviceIndex].control.curfew);
			this.getStateValueFromAdapter(obj_name).then(old_val =>{
				if(old_val != new_val) {
					this.setState(obj_name, new_val, true);
					this.log.debug(`changing curfew_active from ${old_val} to ${new_val}`);
				}
			}).catch(() => {
				this.setState(obj_name, new_val, true);
				this.log.debug(`setting curfew_active to ${new_val}`);
			});
		} catch(error) {
			this.log.error(`could not set curfew_active to adapter (${error})`);
		}

		// assigned pets type
		if(isCatFlap) {
			for(let t = 0; t < this.sureFlapState.devices[deviceIndex].tags.length; t++) {
				if (!this.sureFlapStatePrev.devices || !this.sureFlapStatePrev.devices[deviceIndex].tags[t] || (this.sureFlapState.devices[deviceIndex].tags[t].profile !== this.sureFlapStatePrev.devices[deviceIndex].tags[t].profile)) {
					const name = this.getPetNameForTagId(this.sureFlapState.devices[deviceIndex].tags[t].id);
					const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.assigned_pets.' + name + '.control' + '.type';
					try {
						this.setState(obj_name, this.sureFlapState.devices[deviceIndex].tags[t].profile, true);
					} catch(error) {
						this.log.error(`could not set pet type to adapter (${error})`);
					}
				}
			}
		}
	}

	/**
	 * sets feeder attributes to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setFeederConnectToAdapter(prefix, hierarchy, deviceIndex) {
		const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name;
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].control.lid.close_delay !== this.sureFlapStatePrev.devices[deviceIndex].control.lid.close_delay)) {
			this.setState(obj_name + '.control' + '.close_delay', this.sureFlapState.devices[deviceIndex].control.lid.close_delay, true);
		}
		// feeder config data from sureFlapState
		if (!this.sureFlapStatePrev.devices || (JSON.stringify(this.sureFlapState.devices[deviceIndex].control.bowls.settings) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].control.bowls.settings))) {
			for(let b = 0; b < this.sureFlapState.devices[deviceIndex].control.bowls.settings.length; b++) {
				this.getObject(obj_name + '.bowls.' + b, (err, obj) => {
					if (!err && obj) {
						this.setState(obj_name + '.bowls.' + b + '.food_type', this.sureFlapState.devices[deviceIndex].control.bowls.settings[b].food_type, true);
						this.setState(obj_name + '.bowls.' + b + '.target', this.sureFlapState.devices[deviceIndex].control.bowls.settings[b].target, true);
						this.feederConfigBowlObjectMissing[deviceIndex] = false;
					} else {
						if(!this.feederConfigBowlObjectMissing[deviceIndex]) {
							this.log.warn(`got feeder config data for object '${obj_name + '.bowls.' + b}' but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
							this.feederConfigBowlObjectMissing[deviceIndex] = true;
						}
					}
				});
			}
		}
		// feeder remaining food data from sureFlapReport
		if(this.updateReport && (this.sureFlapReportPrev == undefined || this.sureFlapReportPrev.length == 0 || JSON.stringify(this.sureFlapReport) != JSON.stringify(this.sureFlapReportPrev))) {
			const device_id = this.sureFlapState.devices[deviceIndex].id;
			let last_datapoint;
			// look in feeding data for every pet
			for(let p = 0; p < this.sureFlapState.pets.length; p++) {
				// look in feeding datapoints starting with latest (last)
				for(let i = this.sureFlapReport[p].feeding.datapoints.length-1; i>=0; i--) {
					// check if datapoint is for this feeder
					if(this.sureFlapReport[p].feeding.datapoints[i].device_id == device_id) {
						// check if datapoint is newer then saved datapoint
						if(last_datapoint == undefined || last_datapoint.to == undefined || new Date(last_datapoint.to) < new Date(this.sureFlapReport[p].feeding.datapoints[i].to)) {
							last_datapoint = this.sureFlapReport[p].feeding.datapoints[i];
							break;
						}
					}
				}
			}
			// if datapoint with food data found for this device, write it to adapter
			if(last_datapoint != undefined) {
				for(let b = 0; b < last_datapoint.weights.length; b++) {
					this.getObject(obj_name + '.bowls.' + last_datapoint.weights[b].index, (err, obj) => {
						if (!err && obj) {
							this.getState(obj_name + '.bowls.' + last_datapoint.weights[b].index + '.weight', (err, obj) => {
								if (!err && obj) {
									if(obj.val != last_datapoint.weights[b].weight) {
										this.log.debug(`updating remaining food for feeder '${this.sureFlapState.devices[deviceIndex].name}' bowl '${last_datapoint.weights[b].index}' with '${last_datapoint.weights[b].weight}'.`);
										this.setState(obj_name + '.bowls.' + last_datapoint.weights[b].index + '.weight', last_datapoint.weights[b].weight, true);
									}
									this.feederFoodBowlObjectMissing[deviceIndex] = false;
								} else if(!err && obj == null) {
									this.log.debug(`setting remaining food for feeder '${this.sureFlapState.devices[deviceIndex].name}' bowl '${last_datapoint.weights[b].index}' with '${last_datapoint.weights[b].weight}'.`);
									this.setState(obj_name + '.bowls.' + last_datapoint.weights[b].index + '.weight', last_datapoint.weights[b].weight, true);
									this.feederFoodBowlObjectMissing[deviceIndex] = false;
								} else {
									if(!this.feederFoodBowlObjectMissing[deviceIndex]) {
										this.log.warn(`got feeder remaining food data for object '${obj_name}.bowls.${last_datapoint.weights[b].index}.weight' (${b}) but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
										this.feederFoodBowlObjectMissing[deviceIndex] = true;
									}
								}
							});
						} else {
							if(!this.feederFoodBowlObjectMissing[deviceIndex]) {
								this.log.warn(`got feeder remaining food data for object '${obj_name}.bowls.${last_datapoint.weights[b].index}' (${b}) but object does not exist. This can happen if number of bowls is changed and can be ignored. If you did not change number of bowls or remaining food is not updated properly, contact developer.`);
								this.feederFoodBowlObjectMissing[deviceIndex] = true;
							}
						}
					});
				}
			} else {
				this.log.warn(`no remaining food data for feeder '${this.sureFlapState.devices[deviceIndex].name}' found`);
			}
		}
	}

	/**
	 * sets curfew of flap to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 * @param {object} new_state
	 * @param {string} curfew
	 */
	setCurfewToAdapter(prefix, hierarchy, deviceIndex, new_state, curfew) {
		const obj_name =  prefix + hierarchy + '.' + new_state.devices[deviceIndex].name + '.' + curfew;
		this.getCurfewCountFromAdapter(obj_name).then(num_curfew => {

			this.getCurfewFromAdapter(obj_name).then(curfewObj => {
				this.log.debug(`current ${curfew}: ${JSON.stringify(curfewObj)}`);
			});

			this.log.debug(`number of ${curfew} settings changes from ${num_curfew} to ${new_state.devices[deviceIndex].control.curfew.length}.`);
			if(num_curfew > new_state.devices[deviceIndex].control.curfew.length) {
				this.log.debug(`cleaning up ${curfew}.`);
				for(let h = new_state.devices[deviceIndex].control.curfew.length; h < num_curfew; h++) {
					['.enabled','.lock_time','.unlock_time',''].forEach(state => {
						this.getObject(obj_name + '.' + h + state, (err, obj) => {
							if(obj) {
								this.log.debug(`delete id: ${obj._id}`);
								this.delObject(obj._id, (err) => {
									if(err) {
										this.log.error(`could not delete object '${obj_name}.${h}${state}' (${err})`);
									}
								});
							}
						});
					});
				}
			}

			for(let h = 0; h < new_state.devices[deviceIndex].control.curfew.length; h++) {
				this.setObjectNotExists(obj_name + '.' + h, this.buildChannelObject('curfew setting ' + h), () => {
					['enabled','lock_time','unlock_time'].forEach(state => {
						this.setObjectNotExists(obj_name + '.' + h + '.' + state, this.buildStateObject(state, state === 'enabled' ? 'indicator' : 'value', state === 'enabled' ? 'boolean' : 'string'), () => {
							this.setState(obj_name + '.' + h + '.' + state, state === 'enabled' ? new_state.devices[deviceIndex].control.curfew[h][state] == true : new_state.devices[deviceIndex].control.curfew[h][state], true);
						});
					});
				});
			}
		}).catch(error => {
			this.log.warn(`could not set curfew data to adapter (${error})`);
		});
	}

	/**
	 * sets battery status to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setBatteryStatusToAdapter(prefix, hierarchy, deviceIndex) {
		// battery status
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.battery !== this.sureFlapStatePrev.devices[deviceIndex].status.battery)) {
			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'battery';
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.battery, true);
		}

		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.battery_percentage !== this.sureFlapStatePrev.devices[deviceIndex].status.battery_percentage)) {
			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'battery_percentage';
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.battery_percentage, true);
		}
	}

	/**
	 * sets hub status to the adapter
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setHubStatusToAdapter(prefix,deviceIndex) {
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.led_mode !== this.sureFlapStatePrev.devices[deviceIndex].status.led_mode)) {
			const obj_name =  prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.control.' + 'led_mode';
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.led_mode, true);
		}
	}

	/**
	 * sets online status of devices to the adapter
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setOnlineStatusToAdapter(prefix,deviceIndex) {
		// online status
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.online !== this.sureFlapStatePrev.devices[deviceIndex].status.online)) {
			let obj_name =  prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'online';
			if ('parent' in this.sureFlapState.devices[deviceIndex]) {
				obj_name =  prefix + '.' + this.sureFlapState.devices[deviceIndex].parent.name + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'online';
			}
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.online, true);
		}
	}

	/**
	 * sets pet status to the adapter
	 * @param {string} prefix
	 * @param {string} name
	 * @param {number} petIndex
	 */
	setPetStatusToAdapter(prefix, name, petIndex) {
		if (!this.sureFlapStatePrev.pets || !this.sureFlapStatePrev.pets[petIndex] || (name !== this.sureFlapStatePrev.pets[petIndex].name)) {
			const obj_name = prefix + '.' + name;
			this.setState(obj_name + '.name', name, true);
		}
	}

	/**
	 * sets pet status to the adapter
	 * @param {string} prefix
	 * @param {string} name
	 * @param {number} where
	 * @param {string} since
	 * @param {number} petIndex
	 */
	setPetStatusWithPositionToAdapter(prefix, name, where, since, petIndex) {
		this.setPetStatusToAdapter(prefix, name, petIndex);
		const obj_name = prefix + '.' + name;
		if (!this.sureFlapStatePrev.pets || !this.sureFlapStatePrev.pets[petIndex] || !('position' in this.sureFlapStatePrev.pets[petIndex]) || (where !== this.sureFlapStatePrev.pets[petIndex].position.where) || (since !== this.sureFlapStatePrev.pets[petIndex].position.since)) {
			this.setState(obj_name + '.inside', (where == 1) ? true : false, true);
			this.setState(obj_name + '.since', since, true);
		}
	}

	/**
	 * sets pet feeding to the adapter
	 * @param {string} prefix
	 * @param {number} p
	 */
	setPetFeedingToAdapter(prefix, p) {
		if(!this.sureFlapReport[p].feeding != undefined && this.sureFlapReport[p].feeding.datapoints != undefined && this.sureFlapReport[p].feeding.datapoints.length >0) {
			if(!this.sureFlapReportPrev[p] || !this.sureFlapReportPrev[p].feeding || JSON.stringify(this.sureFlapReport[p].feeding) !== JSON.stringify(this.sureFlapReportPrev[p].feeding)) {
				const consumption_data = this.calculateFoodConsumption(p);
				this.log.debug(`updating food consumed for pet '${this.sureFlapState.pets[p].name}' with '${JSON.stringify(consumption_data)}'`);
				this.setState(prefix + '.last_time_eaten', consumption_data.last_time, true);
				this.setState(prefix + '.times_eaten', consumption_data.count, true);
				this.setState(prefix + '.time_spent', consumption_data.time_spent, true);
				this.setState(prefix + '.wet.weight', consumption_data.weight[FEEDER_FOOD_WET], true);
				this.setState(prefix + '.dry.weight', consumption_data.weight[FEEDER_FOOD_DRY], true);
			}
			this.petFeedingDataMissing[p] = false;
		} else {
			if(!this.petFeedingDataMissing[p]) {
				this.log.warn(`aggregated report for pet '${this.sureFlapState.pets[p].name}' does not contain feeding data`);
				this.petFeedingDataMissing[p] = true;
			}
		}
	}

	/**
	 * sets history event to the adapter
	 * @param {string} prefix
	 * @param {number} household
	 * @param {number} index
	 */
	setHistoryEventToAdapter(prefix, household, index) {
		this.createAdapterStructureFromJson(prefix + '.history.' + index, this.sureFlapHistory[household][index], 'history event ' + index);
	}

	/**
	 * creates folders and states from a json object to the adapter
	 * @param {string} prefix
	 * @param {object} json
	 * @param {string} desc
	 */
	createAdapterStructureFromJson(prefix, json, desc) {
		if(Array.isArray(json)) {
			if(this.arrayContainsObjects(json)) {
				this.setObjectNotExists(prefix, this.buildFolderObject(desc), () => {
					for(let i = 0; i < json.length; i++) {
						this.createAdapterStructureFromJson(prefix + '.' + i, json[i], i.toString());
					}
				});
			} else {
				this.setObjectNotExists(prefix, this.buildStateObject(desc, desc.endsWith('_at') ? 'date' : 'indicator', 'string'), () => {
					this.createAdapterStructureFromJson(prefix, JSON.stringify(json), desc);
				});
			}
		} else if(typeof(json) === 'object') {
			this.setObjectNotExists(prefix, this.buildFolderObject(desc), () => {
				Object.entries(json).forEach(([key,value]) => {
					this.createAdapterStructureFromJson(prefix + '.' + key, value, key);
				});
			});
		} else {
			this.setObjectNotExists(prefix, this.buildStateObject(desc, desc.endsWith('_at') ? 'date' : 'indicator', typeof(json)), () => {
				this.setState(prefix, json, true);
			});
		}
	}

	/*******************************************************************
	 * methods to reset values to the adapter to their previous values *
	 *******************************************************************/

	/**
	 * resets the control close delay adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlCloseDelayToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device);
		const value = this.sureFlapState.devices[deviceIndex].control.lid.close_delay;
		this.log.debug(`resetting control close delay for ${device} to: ${value}`);
		this.setState(hierarchy + '.control' + '.close_delay', value, true);
	}

	/**
	 * resets the control lockmode adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlLockmodeToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device);
		const value = this.sureFlapState.devices[deviceIndex].status.locking.mode;
		this.log.debug(`resetting control lockmode for ${device} to: ${value}`);
		this.setState(hierarchy + '.control' + '.lockmode', value, true);
	}

	/**
	 * resets the pet type adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} tag
	 */
	resetControlPetTypeToAdapter(hierarchy, device, tag) {
		const deviceIndex = this.getDeviceIndex(device);
		const tagIndex = this.getTagIndexForDeviceIndex(deviceIndex, tag);
		const name = this.getPetNameForTagId(tag);
		const value = this.sureFlapState.devices[deviceIndex].tags[tagIndex].profile;
		this.log.debug(`resetting control pet type for ${device} and ${name} to: ${value}`);
		this.setState(hierarchy + '.control' + '.type', value, true);
	}

	/**
	 * resets the control curfew adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlCurfewToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device);
		const value = this.sureFlapState.devices[deviceIndex].control.curfew && this.isCurfewEnabled(this.sureFlapState.devices[deviceIndex].control.curfew);
		this.log.debug(`resetting control curfew for ${device} to: ${value}`);
		this.setState(hierarchy + '.control' + '.curfew', value, true);
	}

	/**
	 * resets the pet inside adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} pet
	 */
	resetPetInsideToAdapter(hierarchy, pet) {
		const petIndex = this.getPetIndex(pet);
		if('position' in this.sureFlapStatePrev.pets[petIndex]) {
			const value = this.sureFlapStatePrev.pets[petIndex].position.where;
			this.log.debug(`resetting pet inside for ${pet} to: ${value}`);
			this.setState(hierarchy + '.pets.' + pet + '.inside', value, true);
		} else {
			this.log.warn(`can not reset pet inside for ${pet} because there is no previous value`);
		}
	}

	/**
	 * resets the hub led mode value to the state value
	 * @param {string} hierarchy
	 * @param {string} hub
	 */
	resetHubLedModeToAdapter(hierarchy, hub) {
		const hubIndex = this.getDeviceIndex(hub);
		if('devices' in this.sureFlapStatePrev == true && 'status' in this.sureFlapStatePrev.devices[hubIndex] == true && 'led_mode' in this.sureFlapStatePrev.devices[hubIndex].status == true) {
			const value = this.sureFlapStatePrev.devices[hubIndex].status.led_mode;
			this.log.debug(`resetting hub led mode for ${hub} to: ${value}`);
			this.setState(hierarchy + '.' + hub + 'control.led_mode', value, true);
		} else {
			this.log.warn(`can not reset hub led mode for ${hub} because there is no previous value`);
		}
	}

	/******************************************
	 * methods to get values from the adapter *
	 ******************************************/

	/**
	 * reads curfew data from the adapter
	 * @param {string} obj_name
	 * @return {Promise} Promise of a curfew JSon object
	 */
	getCurfewFromAdapter(obj_name) {
		return new Promise((resolve, reject) => {
			this.getCurfewCountFromAdapter(obj_name).then(num_curfew => {
				const curfew = [];
				const promiseArray = [];
				for(let h = 0; h < num_curfew; h++) {
					curfew[h] = {};
					promiseArray.push(this.getStateValueFromAdapter(obj_name + '.' + h + '.' + 'enabled'));
					promiseArray.push(this.getStateValueFromAdapter(obj_name + '.' + h + '.' + 'lock_time'));
					promiseArray.push(this.getStateValueFromAdapter(obj_name + '.' + h + '.' + 'unlock_time'));
				}
				Promise.all(promiseArray).then((values) => {
					for(let h = 0; h < num_curfew; h++) {
						curfew[h]['enabled'] = values[h*3];
						curfew[h]['lock_time'] = values[h*3+1];
						curfew[h]['unlock_time'] = values[h*3+2];
					}
					return resolve(curfew);
				}).catch(err => {
					return reject(err);
				});
			}).catch(err => {
				return reject(err);
			});
		});
	}

	/**
	 * reads the number of curfews from the adapter
	 * @param {string} obj_name
	 * @return {Promise} Promise of a curfew count number
	 */
	getCurfewCountFromAdapter(obj_name) {
		return new Promise((resolve) => {
			this.getForeignObjects(this.name + '.' + this.instance + '.' + obj_name + '.*', 'channel', [], (err, obj) => {
				if(obj) {
					return resolve(Object.keys(obj).length);
				} else {
					return resolve(0);
				}
			});
		});
	}

	/*********************************************
	 * methods to delete values from the adapter *
	 *********************************************/

	/**
	 * deletes an object from the adapter
	 * @param {string} obj_name
	 * @param {boolean} recursive
	 * @return {Promise}
	 */
	deleteObjectFormAdapter(obj_name, recursive) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.log.silly(`deleting object '${obj_name}'`);
			this.getObject(obj_name, (err, obj) => {
				if (!err && obj) {
					this.log.silly(`found object '${obj_name}'. trying to delete`);
					this.delObject(obj._id, {'recursive': recursive}, (err) => {
						if(err) {
							this.log.error(`could not delete object '${obj_name}' (${err})`);
							return reject();
						} else {
							this.log.silly(`deleted object '${obj_name}'`);
							return resolve();
						}
					});
				} else {
					this.log.debug(`object '${obj_name}' not found`);
					return resolve();
				}
			});
		}));
	}

	/**
	 * deletes the history for a household from the adapter
	 * @param {number} index
	 * @return {Promise}
	 */
	deleteEventHistoryForHousehold(index) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const prefix = this.sureFlapState.households[index].name;

			this.log.debug(`deleting event history from adapter`);
			for(let i = 0; i < this.sureFlapHistory[index].length; i++) {
				promiseArray.push(this.deleteObjectFormAdapter(prefix + '.history.' + i, true));
			}
			Promise.all(promiseArray).then(() => {
				return resolve();
			}).catch(err => {
				return reject(err);
			});
		}));
	}

	/**
	 * removes obsolte data structures from the adapter
	 * when there are changes to the data structures
	 * obsolete entries go here
	 * @return {Promise}
	 */
	removeObsoleteDataFromAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.log.debug(`searching and removing obsolete objects`);
			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;
				for(let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id == this.sureFlapState.households[h].id) {
						// hub
						if (!('parent' in this.sureFlapState.devices[d])) {
							const obj_name =  prefix + '.' + this.sureFlapState.devices[d].name;

							// made led_mode changeable and moved it to control.led_mode
							this.getObject(obj_name + '.led_mode', (err, obj) => {
								if (!err && obj) {
									this.log.debug(`obsolete object ${obj_name}.led_mode found. trying to delete`);
									this.delObject(obj._id, (err) => {
										if(err) {
											this.log.warn(`can not delete obsolete object ${obj_name}.led_mode because: ${err}`);
										}
									});
								}
							});
						}
						else
						{
							// feeding bowl
							if(this.sureFlapState.devices[d].product_id == DEVICE_TYPE_FEEDER) {
								// feeding bowl
								const obj_name =  prefix + '.' + this.sureFlapState.devices[d].parent.name + '.' + this.sureFlapState.devices[d].name;

								// feeder had unnessessary attributes of flap
								this.getObject(obj_name + '.curfew', (err, obj) => {
									if (!err && obj) {
										this.log.debug(`obsolete object ${obj_name}.curfew found. trying to delete`);
										this.delObject(obj._id, (err) => {
											if(err) {
												this.log.warn(`can not delete obsolete object ${obj_name}.curfew because: ${err}`);
											}
										});
									}
								});
								this.getObject(obj_name + '.last_curfew', (err, obj) => {
									if (!err && obj) {
										this.log.debug(`obsolete object ${obj_name}.last_curfew found. trying to delete`);
										this.delObject(obj._id, (err) => {
											if(err) {
												this.log.warn(`can not delete obsolete object ${obj_name}.last_curfew because: ${err}`);
											}
										});
									}
								});
								this.getObject(obj_name + '.curfew_active', (err, obj) => {
									if (!err && obj) {
										this.log.debug(`obsolete object ${obj_name}.curfew_active found. trying to delete`);
										this.delObject(obj._id, (err) => {
											if(err) {
												this.log.warn(`can not delete obsolete object ${obj_name}.curfew_active because: ${err}`);
											}
										});
									}
								});
								this.getObject(obj_name + '.control.lockmode', (err, obj) => {
									if (!err && obj) {
										this.log.debug(`obsolete object ${obj_name}.control.lockmode found. trying to delete`);
										this.delObject(obj._id, (err) => {
											if(err) {
												this.log.warn(`can not delete obsolete object ${obj_name}.control.lockmode because: ${err}`);
											}
										});
									}
								});
								this.getObject(obj_name + '.control.curfew', (err, obj) => {
									if (!err && obj) {
										this.log.debug(`obsolete object ${obj_name}.control.curfew found. trying to delete`);
										this.delObject(obj._id, (err) => {
											if(err) {
												this.log.warn(`can not delete obsolete object ${obj_name}.control.curfew because: ${err}`);
											}
										});
									}
								});
							}
							// pet flap
							if(this.sureFlapState.devices[d].product_id == DEVICE_TYPE_PET_FLAP) {
								// pet flap
								const obj_name =  prefix + '.' + this.sureFlapState.devices[d].parent.name + '.' + this.sureFlapState.devices[d].name;

								// pet flap had pet type control which is a exclusive feature of cat flap
								for(let t = 0; t < this.sureFlapState.devices[d].tags.length; t++) {
									const name = this.getPetNameForTagId(this.sureFlapState.devices[d].tags[t].id);
									this.getObject(obj_name + '.assigned_pets.' + name, (err, obj) => {
										if (!err && obj) {
											if(obj.type == 'channel') {
												this.log.debug(`obsolete channel object ${obj_name}.assigned_pets.${name} found. trying to delete recursively`);

												this.deleteObjectFormAdapter(obj_name + '.assigned_pets.' + name, true)
													.then(() => {
														this.log.info(`deleted assigned pets for pet flap ${obj_name} because of obsolete control for pet type. please restart adapter to show assigned pets again.`);
													}).catch(() => {
														this.log.warn(`can not delete obsolete object ${obj_name}.assigned_pets.${name}`);
													});
											}
										}
									});
								}

							}
						}
					}
				}
			}
			this.log.debug(`searching and removing of obsolete objects complete`);
			return resolve();
		}));
	}

	/************************************************
	 * methods to initially create object hierarchy *
	 ************************************************/

	/**
	 * creates the adapters object hierarchy
	 * @return {Promise}
	 */
	createAdapterObjectHierarchy() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if(this.firstLoop === true) {
				this.createHouseholdsAndHubsToAdapter()
					.then(() => this.createDevicesToAdapter())
					.then(() => this.createPetsToAdapter())
					.then(() => this.removeObsoleteDataFromAdapter())
					.then(() => { return resolve(); })
					.catch(() => { return reject(); });
			} else {
				return resolve();
			}
		}));
	}

	/**
	 * creates houshold and hub data structures in the adapter
	 * @return {Promise}
	 */
	createHouseholdsAndHubsToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			// households
			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// create household folder
				this.setObjectNotExists(this.sureFlapState.households[h].name, this.buildFolderObject('Household \'' + this.sureFlapState.households[h].name_org + '\' (' + this.sureFlapState.households[h].id + ')'), () => {
					// create history folder
					this.setObjectNotExists(this.sureFlapState.households[h].name + '.history', this.buildFolderObject('Event History'), () => {
						// create hub (devices in household without parent)
						for(let d = 0; d < this.sureFlapState.devices.length; d++) {
							if (this.sureFlapState.devices[d].household_id == this.sureFlapState.households[h].id) {
								if (!('parent' in this.sureFlapState.devices[d])) {
									const obj_name =  prefix + '.' + this.sureFlapState.devices[d].name;
									this.setObjectNotExists(obj_name, this.buildDeviceObject('Hub \'' + this.sureFlapState.devices[d].name_org + '\' (' + this.sureFlapState.devices[d].id + ')'), () => {
										promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('If device is online','indicator.reachable')));
										promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control', this.buildChannelObject('control switches')));
										Promise.all(promiseArray).then(() => {
											this.setObjectNotExists(obj_name + '.control.led_mode', this.buildStateObject('led mode', 'indicator', 'number', false, {0: 'OFF', 1:'HIGH', 4:'DIMMED' }), () => {
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
			}
		}));
	}

	/**
	 * creates device hierarchy data structures in the adapter
	 * @return {Promise}
	 */
	createDevicesToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			// households
			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// create devices in household with parent (sureflap and feeding bowl)
				for(let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id == this.sureFlapState.households[h].id) {
						if ('parent' in this.sureFlapState.devices[d]) {
							const obj_name =  prefix + '.' + this.sureFlapState.devices[d].parent.name + '.' + this.sureFlapState.devices[d].name;
							switch(this.sureFlapState.devices[d].product_id) {
								case DEVICE_TYPE_PET_FLAP:
									// pet flap
								// eslint-disable-next-line no-fallthrough
								case DEVICE_TYPE_CAT_FLAP:
									// cat flap
									promiseArray.push(this.createFlapDevicesToAdapter(d, obj_name, this.sureFlapState.devices[d].product_id == DEVICE_TYPE_CAT_FLAP));
									break;
								case DEVICE_TYPE_FEEDER:
									// feeding bowl
									promiseArray.push(this.createFeederDevicesToAdapter(d, obj_name));
									break;
								// TODO: add water dispenser
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
	 * creates cat and pet flap device hierarchy data structures in the adapter
	 * @param {number} device
	 * @param {string} obj_name
	 * @param {boolean} isCatFlap
	 * @return {Promise}
	 */
	createFlapDevicesToAdapter(device, obj_name, isCatFlap) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(obj_name, this.buildDeviceObject('Device \'' + this.sureFlapState.devices[device].name_org + '\' (' + this.sureFlapState.devices[device].id + ')'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.curfew', this.buildChannelObject('curfew settings')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.last_curfew', this.buildChannelObject('last curfew settings')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.curfew_active', this.buildStateObject('If curfew is active','indicator')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('If device is online','indicator.reachable')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery', this.buildStateObject('battery', 'value.voltage', 'number')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery_percentage', this.buildStateObject('battery percentage', 'value.battery', 'number')));
				this.setObjectNotExists(obj_name + '.control', this.buildChannelObject('control switches'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.lockmode', this.buildStateObject('lockmode', 'switch.mode.lock', 'number', false, {0: 'OPEN', 1:'LOCK INSIDE', 2:'LOCK OUTSIDE', 3:'LOCK BOTH'})));
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.curfew', this.buildStateObject('curfew', 'switch', 'boolean', false)));
					this.setObjectNotExists(obj_name + '.assigned_pets', this.buildChannelObject('assigned pets'), () => {
						for(let t = 0; t < this.sureFlapState.devices[device].tags.length; t++) {
							if(isCatFlap) {
								promiseArray.push(this.createAssignedPetsTypeControl(device, t, obj_name));
							} else {
								const name = this.getPetNameForTagId(this.sureFlapState.devices[device].tags[t].id);
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name, this.buildStateObject('Pet \'' + name + '\' (\'' + this.sureFlapState.devices[device].tags[t].id + '\')', 'text', 'string')));
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
	 * creates assigned pets and their type control for sureflap adapter
	 * @param {number} device
	 * @param {number} tag
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createAssignedPetsTypeControl(device, tag, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const name = this.getPetNameForTagId(this.sureFlapState.devices[device].tags[tag].id);
			this.setObjectNotExists(obj_name + '.assigned_pets.' + name, this.buildChannelObject('Pet \'' + name + '\' (' + this.getPetId(name) + ')'), () => {
				this.setObjectNotExists(obj_name + '.assigned_pets.' + name + '.control', this.buildChannelObject('control switches'), () => {
					this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name + '.control' + '.type', this.buildStateObject('pet type', 'switch.mode.type', 'number', false, { 2: 'OUTDOOR PET', 3: 'INDOOR PET' }))
						.then(() => {
							return resolve();
						}).catch(error => {
							this.log.warn(`could not create adapter flap device assigned pets hierarchy (${error})`);
							return reject();
						});
				});
			});
		}));
	}

	/**
	 * creates feeder bowl device hierarchy data structures in the adapter
	 * @param {number} device
	 * @param {string} obj_name
	 * @return {Promise}
	 */
	createFeederDevicesToAdapter(device, obj_name) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			this.setObjectNotExists(obj_name, this.buildDeviceObject('Device \'' + this.sureFlapState.devices[device].name_org + '\' (' + this.sureFlapState.devices[device].id + ')'), () => {
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('if device is online','indicator.reachable')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery', this.buildStateObject('battery', 'value.voltage', 'number')));
				promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery_percentage', this.buildStateObject('battery percentage', 'value.battery', 'number')));

				this.setObjectNotExists(obj_name + '.control', this.buildChannelObject('control switches'), () => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.close_delay', this.buildStateObject('closing delay of lid', 'switch.mode.delay', 'number', false, {0: 'FAST', 4:'NORMAL', 20:'SLOW'})));

					this.setObjectNotExists(obj_name + '.assigned_pets', this.buildChannelObject('assigned pets'), () => {
						for(let t = 0; t < this.sureFlapState.devices[device].tags.length; t++) {
							const name = this.getPetNameForTagId(this.sureFlapState.devices[device].tags[t].id);
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.assigned_pets.' + name, this.buildStateObject('Pet \'' + name + '\' (\'' + this.sureFlapState.devices[device].tags[t].id + '\')', 'text', 'string')));
						}

						this.setObjectNotExists(obj_name + '.bowls', this.buildChannelObject('feeding bowls'), () => {
							this.setObjectNotExists(obj_name + '.bowls.0', this.buildChannelObject('feeding bowl 0'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.food_type', this.buildStateObject('type of food in bowl','value', 'number', true, {1: 'WET', 2: 'DRY'})));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.target', this.buildStateObject('target weight','value', 'number')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.0.weight', this.buildStateObject('weight','value', 'number')));

								if(this.sureFlapState.devices[device].control.bowls.type == FEEDER_SINGLE_BOWL) {
									// remove bowl 1 (e.g. after change from dual to single bowl)
									promiseArray.push(this.deleteObjectFormAdapter(obj_name + '.bowls.1', true));
									Promise.all(promiseArray).then(() => {
										return resolve();
									}).catch(error => {
										this.log.warn(`could not create adapter feeder device hierarchy (${error})`);
										return reject();
									});
								} else {
									this.setObjectNotExists(obj_name + '.bowls.1', this.buildChannelObject('feeding bowl 1'), () => {
										promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.food_type', this.buildStateObject('type of food in bowl','value', 'number', true, {1: 'WET', 2: 'DRY'})));
										promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.target', this.buildStateObject('target weight','value', 'number')));
										promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.bowls.1.weight', this.buildStateObject('weight','value', 'number')));

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
			});
		}));
	}

	/**
	 * creates pet hierarchy data structures in the adapter
	 * @return {Promise}
	 */
	createPetsToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const numPets = this.sureFlapState.pets.length;

			for (let i = 0; i < numPets; i++) {
				const name = this.sureFlapState.pets[i].name;
				const name_org = this.sureFlapState.pets[i].name_org;
				const petId = this.sureFlapState.pets[i].id;
				const household_name = this.getHouseholdNameForId(this.sureFlapState.pets[i].household_id);
				const prefix = household_name + '.pets';

				// TODO: remove deleted pets
				// TODO: remove deleted pets from assigned pets
				promiseArray.push(this.createPetHierarchyToAdapter(prefix, household_name, name, name_org, petId));
			}
			Promise.all(promiseArray).then(() => {
				return resolve();
			}).catch(() => {
				return reject();
			});
		}));
	}

	/**
	 * creates hierarchy data structures for the given pet in the adapter
	 * @param {string} prefix
	 * @param {string} household_name
	 * @param {string} name
	 * @param {string} name_org
	 * @param {number} id
	 * @return {Promise}
	 */
	createPetHierarchyToAdapter(prefix, household_name, name, name_org, id) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const obj_name = prefix + '.' + name;
			this.setObjectNotExists(prefix, this.buildDeviceObject('Pets in Household ' + household_name),() => {
				this.setObjectNotExists(obj_name, this.buildChannelObject('Pet \'' + name_org + '\' (' + id + ')'),() => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.name', this.buildStateObject(name_org, 'text', 'string')));
					if(this.hasFlap) {
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.inside', this.buildStateObject('is ' + name + ' inside', 'indicator', 'boolean', false)));
						promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.since', this.buildStateObject('last location change', 'date', 'string')));
					}
					if(this.hasFeeder) {
						this.setObjectNotExists(obj_name + '.food', this.buildFolderObject('food'), () => {
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food' + '.last_time_eaten', this.buildStateObject('last time food consumed', 'date', 'string')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food' + '.times_eaten', this.buildStateObject('number of times food consumed today', 'value', 'number')));
							promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food' + '.time_spent', this.buildStateObject('time spent in seconds at feeder today', 'value', 'number')));

							this.setObjectNotExists(obj_name + '.food.wet', this.buildFolderObject('wet food (1)'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food.wet' + '.weight', this.buildStateObject('wet food consumed today', 'value', 'number')));

								this.setObjectNotExists(obj_name + '.food.dry', this.buildFolderObject('dry food (2)'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.food.dry' + '.weight', this.buildStateObject('dry food consumed today', 'value', 'number')));

									Promise.all(promiseArray).then(() => {
										return resolve();
									}).catch(error => {
										this.log.warn(`could not create adapter pet hierarchy (${error})`);
										return reject();
									});
								});
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
			if (this.sureFlapState.devices[d].status.battery) {
				this.sureFlapState.devices[d].status.battery_percentage = this.calculateBatteryPercentage(this.sureFlapState.devices[d].status.battery);
			}
		}
	}

	/**
	 * determines devices in the houshold from the surepet data
	 */
	setConnectedDevices() {
		if(this.firstLoop) {
			for (let d = 0; d < this.sureFlapState.devices.length; d++) {
				switch (this.sureFlapState.devices[d].product_id) {
					case DEVICE_TYPE_CAT_FLAP:
					case DEVICE_TYPE_PET_FLAP:
						this.hasFlap = true;
						break;
					case DEVICE_TYPE_FEEDER:
						this.hasFeeder = true;
						break;
				}
			}
		}
	}

	/**
	 * calculates food consumption data for pet
	 * @param {number} pet
	 * @returns {object} food consumption data object
	 */
	calculateFoodConsumption(pet) {
		const data = {};
		data.count = 0;
		data.last_time = this.getDateFormattedAsISO(new Date(0));
		data.time_spent = 0;
		data.weight = [];
		data.weight[FEEDER_FOOD_WET] = 0;
		data.weight[FEEDER_FOOD_DRY] = 0;
		for (let i = 0; i < this.sureFlapReport[pet].feeding.datapoints.length; i++) {
			const datapoint = this.sureFlapReport[pet].feeding.datapoints[i];
			if (datapoint.context === 1) {
				data.last_time = datapoint.to;
				if (this.isToday(new Date(datapoint.to))) {
					data.count++;
					data.time_spent += new Date(datapoint.to).getTime() - new Date(datapoint.from).getTime();
					this.log.silly(`datapoint '${i}' is food eaten today`);
					for (let b = 0; b < datapoint.weights.length; b++) {
						data.weight[datapoint.weights[b].food_type_id] -= datapoint.weights[b].change;
					}
				}
			}
		}
		data.time_spent = Math.floor(data.time_spent / 1000);
		return data;
	}

	/**
	 * Returns wether the curfew is enabled
	 * @param {object} curfew an array of curfew settings
	 * @return {boolean}
	 */
	isCurfewEnabled(curfew) {
		let enabled = false;
		if(curfew.length > 0) {
			for(let h = 0; h < curfew.length; h++) {
				enabled = enabled || curfew[h].enabled;
			}
		}
		return enabled;
	}

	/**
	 * Calculates wether the current curfew is active
	 * @param {object} curfew an array of curfew settings
	 * @return {boolean}
	 */
	isCurfewActive(curfew) {
		const current_date = new Date();
		const current_hour = current_date.getHours();
		const current_minutes = current_date.getMinutes();
		for(let h = 0; h < curfew.length; h++) {
			if('enabled' in curfew[h] && curfew[h]['enabled'] && 'lock_time' in curfew[h] && 'unlock_time' in curfew[h]) {
				const start = curfew[h]['lock_time'].split(':');
				const end = curfew[h]['unlock_time'].split(':');
				const start_hour = parseInt(start[0]);
				const start_minutes = parseInt(start[1]);
				const end_hour = parseInt(end[0]);
				const end_minutes = parseInt(end[1]);
				//this.log.debug(`curfew ${h} start ${start_hour}:${start_minutes} end ${end_hour}:${end_minutes} current ${current_hour}:${current_minutes}`);
				if(start_hour < end_hour || (start_hour === end_hour && start_minutes < end_minutes)) {
					// current time must be between start and end
					if(start_hour < current_hour || (start_hour === current_hour && start_minutes <= current_minutes)) {
						if(end_hour > current_hour || (end_hour === current_hour && end_minutes > current_minutes)) {
							return true;
						}
					}
				} else {
					// current time must be after start or before end
					if(start_hour < current_hour || (start_hour === current_hour && start_minutes <= current_minutes)) {
						return true;
					} else if(end_hour > current_hour || (end_hour === current_hour && end_minutes > current_minutes)) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * reads a state value from the adapter
	 * @param {string} obj_name
	 * @return {Promise} Promise of a adapter state value
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
	 * returns the device index
	 * @param {number} device
	 * @param {number} tag
	 * @return {number} tag index
	 */
	getTagIndexForDeviceIndex(device, tag) {
		for (let i=0; i < this.sureFlapState.devices[device].tags.length; i++) {
			if (this.sureFlapState.devices[device].tags[i].id === tag) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the device id of the device
	 * @param {string} name
	 * @return {string} device id
	 */
	getDeviceId(name) {
		for (let i=0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name) {
				return this.sureFlapState.devices[i].id;
			}
		}
		return '';
	}

	/**
	 * returns the device index
	 * @param {string} name
	 * @return {number} device index
	 */
	getDeviceIndex(name) {
		for (let i=0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the device type of the device
	 * @param {string} name
	 * @return {number} device type
	 */
	getDeviceType(name) {
		for (let i=0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name) {
				return this.sureFlapState.devices[i].product_id;
			}
		}
		return -1;
	}

	/**
	 * returns the pet id of the pet
	 * @param {string} name
	 * @return {string} pet id
	 */
	getPetId(name) {
		for (let i=0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return this.sureFlapState.pets[i].id;
			}
		}
		return '';
	}

	/**
	 * returns the tag id of the pet
	 * @param {string} name
	 * @return {number} tag id
	 */
	getPetTagId(name) {
		for (let i=0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return this.sureFlapState.pets[i].tag_id;
			}
		}
		return -1;
	}

	/**
	 * returns the pet index of the pet
	 * @param {string} name
	 * @return {number} pet index
	 */
	getPetIndex(name) {
		for (let i=0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the pet name of the tag id
	 * @param {number} tag_id
	 * @return {string} pet name
	 */
	getPetNameForTagId(tag_id) {
		for (let i=0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].tag_id === tag_id) {
				return this.sureFlapState.pets[i].name;
			}
		}
		return '';
	}

	/**
	 * returns the household name of given household id
	 * @param {string} id a household id
	 * @return {string} household name
	 */
	getHouseholdNameForId(id) {
		for (let i=0; i < this.sureFlapState.households.length; i++) {
			if (this.sureFlapState.households[i].id === id) {
				return this.sureFlapState.households[i].name;
			}
		}
		return '';
	}

	/**
	 * normalizes lockmode by changing lockmode 4 to 0
	 * Catflap has 4 lockmodes, Petflap has 5 lockmodes (extra mode for curfew)
	 * scince control should be the same for both flaps, lockmode 4 is removed
	 * and curfew is controlled via control.curfew
	 */
	normalizeLockMode() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if('locking' in this.sureFlapState.devices[d].status && 'mode' in this.sureFlapState.devices[d].status.locking) {
				if(this.sureFlapState.devices[d].status.locking.mode === 4) {
					this.sureFlapState.devices[d].status.locking.mode = 0;
				}
			}
		}
	}

	/**
	 * checks every device and makes the curfew an array if it's not
	 */
	makeCurfewArray() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if('curfew' in this.sureFlapState.devices[d].control) {
				if(!Array.isArray(this.sureFlapState.devices[d].control.curfew)) {
					this.sureFlapState.devices[d].control.curfew = [this.sureFlapState.devices[d].control.curfew];
				}
			} else {
				this.sureFlapState.devices[d].control.curfew = [];
			}
		}
	}

	/**
	 * removes whitespaces and special characters from device, household and pet names
	 */
	makeNamesCanonical() {
		const reg = /[^\w]/ig;
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
	 * returns whether the array contains an object
	 * @param {Array} arr an array
	 * @returns true if the array contains an entry of type object, false otherwise
	 */
	arrayContainsObjects(arr) {
		if(Array.isArray(arr)) {
			for(let i = 0; i < arr.length; i++) {
				if(typeof(arr[i]) === 'object') {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * returns whether the date is today
	 * @param {Date} date
	 * @returns true if the date is today, false otherwise
	 */
	isToday(date) {
		const today = new Date();
		return today.getFullYear() == date.getFullYear() && today.getMonth() == date.getMonth() && today.getDate() == date.getDate();
	}

	/**
	 * returns the current date and time as Y-m-d H:i
	 * @return {string}
	 */
	getCurrentDateFormattedForSurepetApi()
	{
		const date = new Date().toISOString();
		return date.slice(0,10) + ' ' + date.slice(11,16);
	}

	/**
	 * returns the current date in ISO format with timezone
	 * @return {string}
	 */
	getCurrentDateFormattedAsISO()
	{
		return this.getDateFormattedAsISO(new Date());
	}

	/**
	 * returns the current date in ISO format with timezone
	 * @return {string}
	 */
	getDateFormattedAsISO(date)
	{
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
	 * a time part with a leading 0 if smaller then 10
	 * @param {number} num
	 * @return {string}
	 */
	padZero(num) {
		const norm = Math.floor(Math.abs(num));
		return (norm < 10 ? '0' : '') + norm;
	}

	/**
	 * returns the battery percentage
	 * @param {number} battery
	 * @return {number}
	 */
	calculateBatteryPercentage(battery)
	{
		if (battery <= 5) {
			return 0;
		} else if (battery >= 6) {
			return 100;
		} else {
			return Math.round((1 - Math.pow(6 - battery,2)) * 100);
		}
	}

	/**
	 * builds a options JSon object for a http request
	 * @param {string} path
	 * @param {string} method
	 * @param {string} token
	 * @return {object}
	 */
	buildOptions(path, method, token) {
		const options = {
			hostname: 'app.api.surehub.io',
			port: 443,
			path: path,
			method: method,
			headers: {
				'Host' : 'app.api.surehub.io',
				'Accept' : 'application/json, text/plain, */*',
				'Referer' : 'https://surepetcare.io/',
				'Content-Type' : 'application/json;charset=utf-8',
				'Origin' :  'https://surepetcare.io',
				'Cache-Control' : 'no-cache',
				'Pragma' : 'no-cache'
			},
			timeout: 60000
		};

		if (token != undefined && token != '') {
			options.headers['Authorization'] = 'Bearer ' + token;
		}

		return options;
	}

	/**
	 * builds a login JSon data object
	 * @return {object}
	 */
	buildLoginJsonData() {
		return {
			// @ts-ignore
			'email_address': this.config.username,
			// @ts-ignore
			'password': this.config.password,
			'device_id':'1050547954'
		};
	}

	/**
	 * builds a state object
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
	 * @param {string} tag
	 * @param {object} options
	 * @param {object} postData
	 * @return {Promise} Promise of an response JSon object
	 */
	httpRequest(tag, options, postData) {
		return new Promise((resolve, reject) => {
			this.log.silly(`doing http request with tag ${tag}`);
			const req = https.request(options, (res) => {
				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					req.on('error', error => {
						this.log.error(`error: ${error.toString()}`);
					});
					const data = [];
					res.on('data', (chunk) => {
						data.push(chunk);
					});
					res.on('end', () => {
						this.log.debug(`result: ${data.join('')}`);
					});
					return reject(new Error(`Request returned status code ${res.statusCode}`));
				} else {
					req.on('error', error => {
						this.log.error(`error: ${error.toString()}`);
						return reject(new Error(`Request returned an error`));
					});
					const data = [];
					res.on('data', (chunk) => {
						data.push(chunk);
					});
					res.on('end', () => {
						try {
							const obj = JSON.parse(data.join(''));
							return resolve(obj);
						} catch(err) {
							if(err instanceof Error) {
								this.log.error(err.message);
							}
							return reject(new Error(`JSon parse error in ${data}`));
						}
					});
				}
			});

			req.on('error', (err) => {
				return reject(new Error(`Request error: ${err} retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
			});

			req.on('timeout', () => {
				return reject(new Error(`Request timeout: retrying in ${RETRY_FREQUENCY_LOGIN} seconds`));
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