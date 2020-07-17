const fs = require('fs');

async function read(fd, position, length) {
    return new Promise((resolve, reject) => {
        const b = new Buffer.alloc(length);
        fs.read(fd, b, 0, length, position, (err, bytesRead, buffer) => {
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

    fileSize: (filename) => {
        const stats = fs.statSync(filename)
        return stats["size"]
    }
}

