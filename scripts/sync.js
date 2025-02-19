const mongoose = require('mongoose');
const db = require('../lib/database');
const Tx = require('../models/tx');
const Address = require('../models/address');
const AddressTx = require('../models/addresstx');
const Richlist = require('../models/richlist');
const Stats = require('../models/stats');
const settings = require('../lib/settings');
const fs = require('fs').promises; // Use promises for file operations

let mode = 'update';
let database = 'index';

// Displays usage and exits
function usage()
{
	console.log('Usage: node scripts/sync.js [database] [mode]');
	console.log('');
	console.log('database: (required)');
	console.log('index [mode]  Main index: coin info/stats, transactions & addresses');
	console.log('market       Market data: summaries, orderbooks, trade history & chartdata');
	console.log('');
	console.log('mode: (required for index database only)');
	console.log('update       Updates index from last sync to current block');
	console.log('check        Checks index for (and adds) any missing transactions/addresses');
	console.log('reindex      Clears index then resyncs from genesis to current block');
	console.log('reindex-rich Rebuilds the rich list');
	console.log('');
	console.log('notes:');
	console.log('* "current block" is the latest created block when script is executed.');
	console.log('* The market database only supports (& defaults to) reindex mode.');
	console.log('* If check mode finds missing data (ignoring new data since last sync),');
	console.log('  index_timeout in settings.json is set too low.');
	console.log('');
	process.exit(0);
}

// Check command-line arguments
if (process.argv[2] === 'index')
{
	if (process.argv.length < 3)
	{
		usage();
	}
	else
	{
		switch (process.argv[3])
		{
			case 'update':
			case 'check':
			case 'reindex':
			case 'reindex-rich':
				mode = process.argv[3];
				break;
			default:
				usage();
		}
	}
}
else if (process.argv[2] === 'market')
{
	database = 'market';
}
else
{
	usage();
}

// Lock file functions
async function createLock()
{
	if (database === 'index')
	{
		const fname = `./tmp/${database}.pid`;
		try
		{
			await fs.writeFile(fname, process.pid.toString());
		}
		catch (err)
		{
			console.error(`Error: unable to create ${fname}`);
			process.exit(1);
		}
	}
}

async function removeLock()
{
	if (database === 'index')
	{
		const fname = `./tmp/${database}.pid`;
		try
		{
			await fs.unlink(fname);
		}
		catch (err)
		{
			console.error(`Unable to remove lock: ${fname}`);
			process.exit(1);
		}
	}
}

async function isLocked()
{
	if (database === 'index')
	{
		const fname = `./tmp/${database}.pid`;
		try
		{
			await fs.access(fname);
			return true;
		}
		catch
		{
			return false;
		}
	}
	return false;
}

async function exit()
{
	await removeLock();
	await mongoose.disconnect();
	process.exit(0);
}

(async () =>
{
	if (await isLocked())
	{
		console.log("Script already running...");
		process.exit(0);
	}

	await createLock();
	console.log(`Script launched with pid: ${process.pid}`);

	try
	{
		await mongoose.connect(
			`mongodb://${settings.dbsettings.user}:${settings.dbsettings.password}@${settings.dbsettings.address}:${settings.dbsettings.port}/${settings.dbsettings.database}`
		);

		if (database === 'index')
		{
			const statsExist = await db.check_stats(settings.coin);
			if (!statsExist)
			{
				console.log("Run 'npm start' to create database structures before running this script.");
				exit();
			}
			else
			{
				const stats = await db.update_db(settings.coin);

				if (settings.heavy)
				{
					await db.update_heavy(settings.coin, stats.count, 20);
				}

				if (mode === 'reindex')
				{
					await Tx.deleteMany({});
					console.log('TXs cleared.');
					await Address.deleteMany({});
					console.log('Addresses cleared.');
					await AddressTx.deleteMany({});
					console.log('Address TXs cleared.');
					await Richlist.updateOne({coin: settings.coin}, {received: [], balance: []});
					await Stats.updateOne({coin: settings.coin}, {last: 0, count: 0, supply: 0});

					console.log('Index cleared (reindex)');
					await db.update_tx_db(settings.coin, 1, stats.count, settings.update_timeout);
					await db.update_richlist('received');
					await db.update_richlist('balance');
					const nstats = await db.get_stats(settings.coin);
					console.log(`Reindex complete (block: ${nstats.last})`);
					exit();
				}
				else if (mode === 'check')
				{
					await db.update_tx_db(settings.coin, 1, stats.count, settings.check_timeout);
					const nstats = await db.get_stats(settings.coin);
					console.log(`Check complete (block: ${nstats.last})`);
					exit();
				}
				else if (mode === 'update')
				{
					await db.update_tx_db(settings.coin, stats.last, stats.count, settings.update_timeout);
					await db.update_richlist('received');
					await db.update_richlist('balance');
					const nstats = await db.get_stats(settings.coin);
					console.log(`Update complete (block: ${nstats.last})`);
					exit();
				}
				else if (mode === 'reindex-rich')
				{
					console.log('Update started');
					await db.update_tx_db(settings.coin, stats.last, stats.count, settings.check_timeout);
					console.log('Update finished');

					const richlistExists = await db.check_richlist(settings.coin);
					if (richlistExists)
					{
						console.log('Richlist entry found, deleting now...');
						await db.delete_richlist(settings.coin);
						console.log('Richlist entry deleted');
					}

					await db.create_richlist(settings.coin);
					console.log('Richlist created.');
					await db.update_richlist('received');
					console.log('Richlist updated: received.');
					await db.update_richlist('balance');
					console.log('Richlist updated: balance.');

					const nstats = await db.get_stats(settings.coin);
					console.log(`Update complete (block: ${nstats.last})`);
					exit();
				}
			}
		}
		else
		{
			// Update market data
			const markets = settings.markets.enabled;
			let complete = 0;

			for (const market of markets)
			{
				const exists = await db.check_market(market);
				if (exists)
				{
					try
					{
						await db.update_markets_db(market);
						console.log(`${market} market data updated successfully.`);
					}
					catch (err)
					{
						console.log(`${market}: ${err}`);
					}
				}
				else
				{
					console.log(`Error: entry for ${market} does not exist in markets db.`);
				}
				complete++;
				if (complete === markets.length)
				{
					exit();
				}
			}
		}
	}
	catch (err)
	{
		console.error('Error:', err);
		exit();
	}
})();
