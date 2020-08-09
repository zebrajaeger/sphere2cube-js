const fs = require('fs');

async function readFs(fd, position, length, buffer) {
    return new Promise((resolve, reject) => {
        fs.read(fd, buffer, 0, length, position, (err, bytesRead, buffer) => {
            if (err) {
                reject(err);
            } else {
                if (length !== bytesRead) {
                    reject('File to short')
                } else {
                    resolve(buffer);
                }
            }
        })
    });
}

async function read(fd, position, length) {
    return readFs(fd, position, length, new Buffer.alloc(length));
}

async function readAsSharedInt8Array(fd, position, length) {
    const buffer = new Int8Array(new SharedArrayBuffer(length))
    return readFs(fd, position, length, buffer);
}

exports.RandomAccessFile = {
    open: async (path) => {
        return new Promise((resolve, reject) => {
            fs.open(path, 'r', (err, fd) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(fd);
                }
            })
        })
    },

    close: async (fd) => {
        return new Promise((resolve, reject) => {
            fs.close(fd, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        })
    },

    read: read,
    readAsSharedInt8Array: readAsSharedInt8Array,

    fileSize: (filename) => {
        const stats = fs.statSync(filename)
        return stats["size"]
    }
}

