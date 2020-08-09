const {parentPort} = require('worker_threads');
const {decodePackbits} = require('./packbits')

async function toExec(data) {
    const l = decodePackbits(data.source, data.target);
    if (l !== data.target.length) {
        const msg = `Line length differs. Expected: ${data.target.length} but is: ${l}`
        //console.log('FAIL', msg)
        throw new Error(msg)
    }
    return data;
}

parentPort.on('message', async data => {
    try {
        parentPort.postMessage({result: await toExec(data), data});
    } catch (error) {
        parentPort.postMessage({error, data});
    }
});

