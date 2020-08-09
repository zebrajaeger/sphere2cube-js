

function decodePackbits(source, target) {

    let targetIndex = 0;
    let sourceIndex = 0;
    while (sourceIndex < source.length) {
        const byte = source[sourceIndex++];
        // -128 -> skip
        if (byte === -128) {
            continue;
        }

        if (byte < 0) {
            // -1 to -127 -> one byte of data repeated (1 - byte) times
            let length = 1 - byte;
            const val = source[sourceIndex++];
            for (let i = 0; i < length; ++i) {
                target[targetIndex++] = val;
            }
        } else {
            // 0 to 127 -> (1 + byte) literal bytes
            let length = 1 + byte;
            for (let j = 0; j < length; ++j) {
                target[targetIndex++] = source[sourceIndex++];
            }
        }
    }

    return targetIndex;
}


module.exports = {
    decodePackbits
}