'use strict'

const JSON5 = require('json5')
const {DateTime} = require('luxon')
const test = require('tape')
const {readFileSync, createReadStream} = require('fs')

const readCsv = require('../read-csv')
const formatDate = require('../format-date')
const daysBetween = require('../lib/days-between')
// const computeStopovers = require('../compute-stopovers')
const computeSortedConnections = require('../compute-sorted-connections')
const computeServiceBreaks = require('../compute-service-breaks')
const {extendedToBasic} = require('../route-types')

const readJSON5Sync = (path) => {
	return JSON5.parse(readFileSync(path, {encoding: 'utf8'}))
}

const testWithFixtures = (fn, fixtures, prefix = '') => {
	fixtures.forEach((f) => {
		const title = [prefix, f.title].filter(s => !!s).join(' – ')
		const args = f.args.map(a => a[1]) // select values
		const testFn = f.fails
			? (t) => {
				t.plan(1)
				t.throws(() => fn(...args))
			}
			: (t) => {
				t.plan(1)
				t.deepEqual(fn(...args), f.result)
			}
		test(title, testFn)
	})
}

testWithFixtures(
	require('../parse-date'),
	readJSON5Sync(require.resolve('./fixtures/parse-date.json5')),
	'parse-date',
)

testWithFixtures(
	require('../parse-time'),
	readJSON5Sync(require.resolve('./fixtures/parse-time.json5')),
	'parse-time',
)

testWithFixtures(
	require('../lib/resolve-time'),
	readJSON5Sync(require.resolve('./fixtures/resolve-time.json5')),
	'resolve-time',
)

// const data = {
// 	services: require('sample-gtfs-feed/json/calendar.json'),
// 	exceptions: require('sample-gtfs-feed/json/calendar_dates.json'),
// 	trips: require('sample-gtfs-feed/json/trips.json'),
// 	stopovers: require('sample-gtfs-feed/json/stop_times.json')
// }
const readFile = (file) => {
	return readCsv(require.resolve('sample-gtfs-feed/gtfs/' + file + '.txt'))
}

const utc = 'Etc/UTC'
const berlin = 'Europe/Berlin'

test('read-csv: accept a readable stream as input', (t) => {
	const readable = createReadStream(require.resolve('sample-gtfs-feed/gtfs/stops.txt'))
	const src = readCsv(readable)

	src.once('data', (stop) => {
		t.ok(stop)
		t.ok(stop.stop_id)
		src.destroy()
		t.end()
	})
})

test('format-date', (t) => {
	t.plan(3)
	t.equal(formatDate(1551571200, utc), '20190303')
	t.equal(formatDate(1551567600, berlin), '20190303')
	t.equal(formatDate(1551546000, 'Asia/Bangkok'), '20190303')
})

test('lib/days-between', (t) => {
	const march3rd = 1551567600 // Europe/Berlin
	const march4th = 1551654000 // Europe/Berlin
	const march5th = 1551740400 // Europe/Berlin
	const allWeekdays = {
		monday: true,
		tuesday: true,
		wednesday: true,
		thursday: true,
		friday: true,
		saturday: true,
		sunday: true
	}

	t.deepEqual(daysBetween('20190313', '20190303', allWeekdays, berlin), [])
	t.deepEqual(daysBetween('20190303', '20190303', allWeekdays, berlin), [
		march3rd
	])
	t.deepEqual(daysBetween('20190303', '20190305', allWeekdays, berlin), [
		march3rd,
		march4th,
		march5th
	])
	t.equal(daysBetween('20190303', '20190313', allWeekdays, berlin).length, 11)

	const many = daysBetween('20190303', '20190703', allWeekdays, berlin)
	t.ok(Array.isArray(many))
	for (let ts of many) {
		const d = DateTime.fromMillis(ts * 1000, {zone: berlin})
		if (d.hour !== 0) console.error(ts)
		t.equal(d.hour, 0)
		t.equal(d.minute, 0)
		t.equal(d.second, 0)
		t.equal(d.millisecond, 0)
	}

	t.end()
})

require('./read-stop-times')

test.skip('compute-stopovers', (t) => {
	// todo
	t.end()
})

test.skip('compute-sorted-connections', (t) => {
	const from = 1552324800
	const to = 1552393000

	computeSortedConnections(readFile, {}, 'Europe/Berlin')
	.then((sortedConnections) => {
		const fromI = sortedConnections.findIndex(c => c.departure >= from)
		const toI = sortedConnections.findIndex(c => c.departure > to)
		const connections = sortedConnections.slice(fromI, toI)

		t.deepEqual(connections, [{
			tripId: 'b-outbound-on-working-days',
			fromStop: 'lake',
			departure: 1552324920,
			toStop: 'airport',
			arrival: 1552325400,
			routeId: 'B',
			serviceId: 'on-working-days'
		},
		{
			tripId: 'b-downtown-on-working-days',
			fromStop: 'airport',
			departure: 1552392840,
			toStop: 'lake',
			arrival: 1552393200,
			routeId: 'B',
			serviceId: 'on-working-days'
		}])
		t.end()
	})
	.catch(t.ifError)
})

test.skip('compute-service-breaks', (t) => {
	const from = '2019-05-08T12:00:00+02:00'
	const to = '2019-05-10T15:00:00+02:00'

	computeSortedConnections(readFile, {}, 'Europe/Berlin')
	.then((connections) => {
		const {findBetween, data} = computeServiceBreaks(connections)

		const breaks = findBetween('airport', 'lake', from, to)
		t.deepEqual(breaks, [{
			start: new Date('2019-05-08T13:14:00+02:00'),
			end: new Date('2019-05-09T13:14:00+02:00'),
			duration: 86400,
			routeId: 'B',
			serviceId: 'on-working-days'
		}, {
			start: new Date('2019-05-09T13:14:00+02:00'),
			end: new Date('2019-05-10T13:14:00+02:00'),
			duration: 86400,
			routeId: 'B',
			serviceId: 'on-working-days'
		}])
		t.end()
	})
	.catch(t.ifError)
})

test('extendedToBasic', (t) => {
	t.plan(2)
	t.equal(extendedToBasic(110), 0)
	t.equal(extendedToBasic(706), 3)
})
