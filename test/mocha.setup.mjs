// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e) => {
	throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import {should, use} from 'chai';

should();
use(sinonChai);
use(chaiAsPromised);