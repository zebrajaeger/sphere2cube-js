const {performance} = require('perf_hooks');

const humanizeDuration = require("humanize-duration");

module.exports.Stopwatch = class {
    _startTime;

    begin() {
        this._startTime = performance.now();
        return this;
    }

    getDuration() {
        const now = performance.now();
        return this.round(now - this._startTime, -2)
    }

    getTimeString() {
        return humanizeDuration(this.getDuration());
    }

    round(value, exp) {
        if (typeof exp === 'undefined' || +exp === 0)
            return Math.round(value);

        value = +value;
        exp = +exp;

        if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
            return NaN;

        // Shift
        value = value.toString().split('e');
        value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp)));

        // Shift back
        value = value.toString().split('e');
        return +(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp));
    }
}
