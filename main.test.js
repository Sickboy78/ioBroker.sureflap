'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

// ─── Minimal adapter-core mock ────────────────────────────────────────────────

class MockAdapter {
    constructor() {
        this.log = {
            silly: sinon.stub(),
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
        };
    }
    on() {}
    getObject() {}
    delObject() {}
}

// ─── Load adapter under test ──────────────────────────────────────────────────

const createAdapter = proxyquire('./main', {
    '@iobroker/adapter-core': { Adapter: MockAdapter, '@noCallThru': true },
    './lib/surepet-api': class SurepetApi {},
});

function makeAdapter() {
    return createAdapter({});
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const DEVICE_TYPE_HUB = 1;
const DEVICE_TYPE_CAT_FLAP = 6;

const HOUSEHOLDS = [
    { id: 10, name: 'Home' },
    { id: 20, name: 'Barn' },
];

const DEVICES = {
    10: [{ id: 1001, name: 'Hub', product_id: DEVICE_TYPE_HUB }],
    20: [
        { id: 2001, name: 'CatFlap', product_id: DEVICE_TYPE_CAT_FLAP },
        { id: 2002, name: 'AnotherFlap', product_id: DEVICE_TYPE_CAT_FLAP },
    ],
};

const PETS = [
    { id: 10, tag_id: 100, name: 'Whiskers', name_org: 'Whiskers!' },
    { id: 20, tag_id: 200, name: 'Mittens', name_org: 'Mittens!' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sureflap', () => {
    let adapter;

    beforeEach(() => {
        adapter = makeAdapter();
    });

    afterEach(() => {
        sinon.restore();
    });

    // ─── getHouseholdNameById ─────────────────────────────────────────────────

    describe('getHouseholdNameById', () => {
        beforeEach(() => {
            adapter.households = HOUSEHOLDS;
        });

        it('returns the name for a matching id', () => {
            expect(adapter.getHouseholdNameById(10)).to.equal('Home');
            expect(adapter.getHouseholdNameById(20)).to.equal('Barn');
        });

        it('returns undefined when id is not found', () => {
            expect(adapter.getHouseholdNameById(99)).to.be.undefined;
        });
    });

    // ─── doesTagsArrayContainTagId ────────────────────────────────────────────

    describe('doesTagsArrayContainTagId', () => {
        it('returns true when tag_id is present', () => {
            expect(adapter.doesTagsArrayContainTagId([{ id: 1 }, { id: 2 }], 2)).to.be.true;
        });

        it('returns false when tag_id is absent', () => {
            expect(adapter.doesTagsArrayContainTagId([{ id: 1 }, { id: 2 }], 3)).to.be.false;
        });

        it('returns false for an empty array', () => {
            expect(adapter.doesTagsArrayContainTagId([], 1)).to.be.false;
        });

        it('returns false when tags is undefined', () => {
            expect(adapter.doesTagsArrayContainTagId(undefined, 1)).to.be.false;
        });

        it('returns false when tags is not an array', () => {
            expect(adapter.doesTagsArrayContainTagId('not-an-array', 1)).to.be.false;
        });

        it('returns false when tag_id is undefined', () => {
            expect(adapter.doesTagsArrayContainTagId([{ id: 1 }], undefined)).to.be.false;
        });
    });

    // ─── Pet helpers ──────────────────────────────────────────────────────────

    describe('pet lookup', () => {
        beforeEach(() => {
            adapter.pets = PETS;
        });

        describe('_getPetByName', () => {
            it('returns the pet object when name matches', () => {
                expect(adapter._getPetByName('Whiskers')).to.deep.equal(PETS[0]);
            });

            it('returns undefined when name is not found', () => {
                expect(adapter._getPetByName('Ghost')).to.be.undefined;
            });
        });

        describe('_getPetByTagId', () => {
            it('returns the pet object when tag_id matches', () => {
                expect(adapter._getPetByTagId(200)).to.deep.equal(PETS[1]);
            });

            it('returns undefined when tag_id is not found', () => {
                expect(adapter._getPetByTagId(999)).to.be.undefined;
            });
        });

        describe('getPetIdByName', () => {
            it('returns the pet id for a matching name', () => {
                expect(adapter.getPetIdByName('Mittens')).to.equal(20);
            });

            it('returns -1 when not found', () => {
                expect(adapter.getPetIdByName('Ghost')).to.equal(-1);
            });
        });

        describe('getPetTagIdByName', () => {
            it('returns the tag_id for a matching name', () => {
                expect(adapter.getPetTagIdByName('Whiskers')).to.equal(100);
            });

            it('returns -1 when not found', () => {
                expect(adapter.getPetTagIdByName('Ghost')).to.equal(-1);
            });
        });

        describe('getPetIndexByName', () => {
            it('returns the array index for a matching name', () => {
                expect(adapter.getPetIndexByName('Whiskers')).to.equal(0);
                expect(adapter.getPetIndexByName('Mittens')).to.equal(1);
            });

            it('returns -1 when not found', () => {
                expect(adapter.getPetIndexByName('Ghost')).to.equal(-1);
            });
        });

        describe('getPetIdForTagId', () => {
            it('returns the pet id for a matching tag_id', () => {
                expect(adapter.getPetIdForTagId(100)).to.equal(10);
            });

            it('returns undefined when not found', () => {
                expect(adapter.getPetIdForTagId(999)).to.be.undefined;
            });
        });

        describe('getPetNameByTagId', () => {
            it('returns the pet name for a matching tag_id', () => {
                expect(adapter.getPetNameByTagId(200)).to.equal('Mittens');
            });

            it('returns undefined when not found', () => {
                expect(adapter.getPetNameByTagId(999)).to.be.undefined;
            });
        });

        describe('getPetNameOrgByTagId', () => {
            it('returns the original pet name for a matching tag_id', () => {
                expect(adapter.getPetNameOrgByTagId(100)).to.equal('Whiskers!');
            });

            it('returns undefined when not found', () => {
                expect(adapter.getPetNameOrgByTagId(999)).to.be.undefined;
            });
        });
    });

    // ─── Device helpers ───────────────────────────────────────────────────────

    describe('device lookup', () => {
        beforeEach(() => {
            adapter.households = HOUSEHOLDS;
            adapter.devices = DEVICES;
        });

        describe('_findDeviceByName', () => {
            it('returns device, householdId, and index when found', () => {
                expect(adapter._findDeviceByName('CatFlap', [DEVICE_TYPE_CAT_FLAP])).to.deep.equal({
                    device: DEVICES[20][0],
                    householdId: 20,
                    index: 0,
                });
            });

            it('returns the correct index for a non-first device', () => {
                expect(adapter._findDeviceByName('AnotherFlap', [DEVICE_TYPE_CAT_FLAP])).to.deep.equal({
                    device: DEVICES[20][1],
                    householdId: 20,
                    index: 1,
                });
            });

            it('returns undefined when name is not found', () => {
                expect(adapter._findDeviceByName('Unknown', [DEVICE_TYPE_HUB])).to.be.undefined;
            });

            it('returns undefined when type does not match', () => {
                expect(adapter._findDeviceByName('Hub', [DEVICE_TYPE_CAT_FLAP])).to.be.undefined;
            });

            it('matches any type when deviceTypes is empty', () => {
                const result = adapter._findDeviceByName('Hub', []);
                expect(result).to.not.be.undefined;
                expect(result.device.id).to.equal(1001);
            });

            it('returns the correct householdId when searching across households', () => {
                expect(adapter._findDeviceByName('Hub', [DEVICE_TYPE_HUB]).householdId).to.equal(10);
                expect(adapter._findDeviceByName('CatFlap', [DEVICE_TYPE_CAT_FLAP]).householdId).to.equal(20);
            });
        });

        describe('getDeviceIdByName', () => {
            it('returns the device id when found', () => {
                expect(adapter.getDeviceIdByName('Hub', [DEVICE_TYPE_HUB])).to.equal(1001);
            });

            it('returns -1 when not found', () => {
                expect(adapter.getDeviceIdByName('Unknown', [DEVICE_TYPE_HUB])).to.equal(-1);
            });
        });

        describe('getDeviceIndexAndHouseholdIdByName', () => {
            it('returns index and householdId when found', () => {
                expect(adapter.getDeviceIndexAndHouseholdIdByName('CatFlap', [DEVICE_TYPE_CAT_FLAP])).to.deep.equal({
                    index: 0,
                    householdId: 20,
                });
            });

            it('returns undefined when not found', () => {
                expect(adapter.getDeviceIndexAndHouseholdIdByName('Unknown', [])).to.be.undefined;
            });
        });

        describe('getDeviceTypeByName', () => {
            it('returns the product_id when name and type match', () => {
                expect(adapter.getDeviceTypeByName('Hub', [DEVICE_TYPE_HUB])).to.equal(DEVICE_TYPE_HUB);
            });

            it('returns -1 when name matches but type does not', () => {
                expect(adapter.getDeviceTypeByName('Hub', [DEVICE_TYPE_CAT_FLAP])).to.equal(-1);
            });

            it('returns -1 when name is not found', () => {
                expect(adapter.getDeviceTypeByName('Unknown', [DEVICE_TYPE_HUB])).to.equal(-1);
            });

            it('returns the product_id with empty deviceTypes (matches any type)', () => {
                // empty array means "all types", consistent with the other device lookup methods
                expect(adapter.getDeviceTypeByName('Hub', [])).to.equal(DEVICE_TYPE_HUB);
            });
        });

        describe('getDeviceById', () => {
            it('returns the device when id matches', () => {
                expect(adapter.getDeviceById(2001)).to.deep.equal(DEVICES[20][0]);
            });

            it('returns undefined when id is not found', () => {
                expect(adapter.getDeviceById(9999)).to.be.undefined;
            });
        });
    });

    // ─── _deleteObjectIfExists ────────────────────────────────────────────────

    describe('_deleteObjectIfExists', () => {
        const fakeObj = { _id: 'sureflap.0.test', type: 'state', common: { name: 'device-123' } };
        let getObjectStub;
        let delObjectStub;

        beforeEach(() => {
            getObjectStub = sinon.stub(adapter, 'getObject');
            delObjectStub = sinon.stub(adapter, 'delObject');
        });

        it('resolves without deleting when object does not exist', async () => {
            getObjectStub.callsArgWith(1, null, null);
            await adapter._deleteObjectIfExists('test.obj', false);
            expect(delObjectStub).not.to.have.been.called;
        });

        it('resolves and deletes when object exists', async () => {
            getObjectStub.callsArgWith(1, null, fakeObj);
            delObjectStub.callsArgWith(2, null);
            await adapter._deleteObjectIfExists('test.obj', false);
            expect(delObjectStub).to.have.been.calledOnce;
        });

        it('passes the recursive flag to delObject', async () => {
            getObjectStub.callsArgWith(1, null, fakeObj);
            delObjectStub.callsArgWith(2, null);
            await adapter._deleteObjectIfExists('test.obj', true);
            expect(delObjectStub).to.have.been.calledWith(fakeObj._id, { recursive: true });
        });

        it('passes the object to the condition function', async () => {
            getObjectStub.callsArgWith(1, null, fakeObj);
            delObjectStub.callsArgWith(2, null);
            const condition = sinon.stub().returns(true);
            await adapter._deleteObjectIfExists('test.obj', false, condition);
            expect(condition).to.have.been.calledWith(fakeObj);
        });

        it('resolves without deleting when condition returns false', async () => {
            getObjectStub.callsArgWith(1, null, fakeObj);
            await adapter._deleteObjectIfExists('test.obj', false, () => false);
            expect(delObjectStub).not.to.have.been.called;
        });

        it('calls conditionFailMessage with the object when condition fails', async () => {
            getObjectStub.callsArgWith(1, null, fakeObj);
            const conditionFailMessage = sinon.stub().returns('reason');
            await adapter._deleteObjectIfExists('test.obj', false, () => false, conditionFailMessage);
            expect(conditionFailMessage).to.have.been.calledWith(fakeObj);
        });

        it('rejects when delObject returns an error', async () => {
            getObjectStub.callsArgWith(1, null, fakeObj);
            delObjectStub.callsArgWith(2, new Error('delete failed'));
            await expect(adapter._deleteObjectIfExists('test.obj', false)).to.be.rejected;
        });
    });

    // ─── deleteObjectIfExistsAndHasType ───────────────────────────────────────

    describe('deleteObjectIfExistsAndHasType', () => {
        let getObjectStub;
        let delObjectStub;

        beforeEach(() => {
            getObjectStub = sinon.stub(adapter, 'getObject');
            delObjectStub = sinon.stub(adapter, 'delObject');
        });

        it('deletes when the object type matches', async () => {
            getObjectStub.callsArgWith(1, null, { _id: 'test.obj', type: 'channel' });
            delObjectStub.callsArgWith(2, null);
            await adapter.deleteObjectIfExistsAndHasType('test.obj', 'channel', true);
            expect(delObjectStub).to.have.been.calledOnce;
        });

        it('does not delete when the object type does not match', async () => {
            getObjectStub.callsArgWith(1, null, { _id: 'test.obj', type: 'state' });
            await adapter.deleteObjectIfExistsAndHasType('test.obj', 'channel', false);
            expect(delObjectStub).not.to.have.been.called;
        });
    });

    // ─── deleteObjectWithDeviceIdIfExists ─────────────────────────────────────

    describe('deleteObjectWithDeviceIdIfExists', () => {
        let getObjectStub;
        let delObjectStub;

        beforeEach(() => {
            getObjectStub = sinon.stub(adapter, 'getObject');
            delObjectStub = sinon.stub(adapter, 'delObject');
        });

        it('deletes when common.name contains the device_id', async () => {
            getObjectStub.callsArgWith(1, null, { _id: 'test.obj', common: { name: 'hub-device-123-x' } });
            delObjectStub.callsArgWith(2, null);
            await adapter.deleteObjectWithDeviceIdIfExists('test.obj', 'device-123', false);
            expect(delObjectStub).to.have.been.calledOnce;
        });

        it('does not delete when common.name does not contain the device_id', async () => {
            getObjectStub.callsArgWith(1, null, { _id: 'test.obj', common: { name: 'hub-other-456' } });
            await adapter.deleteObjectWithDeviceIdIfExists('test.obj', 'device-123', false);
            expect(delObjectStub).not.to.have.been.called;
        });

        it('does not delete when common.name is missing', async () => {
            getObjectStub.callsArgWith(1, null, { _id: 'test.obj', common: {} });
            await adapter.deleteObjectWithDeviceIdIfExists('test.obj', 'device-123', false);
            expect(delObjectStub).not.to.have.been.called;
        });

        it('does not delete when common is missing', async () => {
            getObjectStub.callsArgWith(1, null, { _id: 'test.obj' });
            await adapter.deleteObjectWithDeviceIdIfExists('test.obj', 'device-123', false);
            expect(delObjectStub).not.to.have.been.called;
        });
    });
});