var mongoose = require('mongoose'),
	Stats = require('../models/stats'),
	Address = require('../models/address'),
	AddressTx = require('../models/addresstx'),
	Tx = require('../models/tx'),
	Richlist = require('../models/richlist'),
	lib = require('../lib/explorer'),
	settings = require('../lib/settings'),
	fs = require('fs');
const db = require("../lib/database");

const mode = 'update';
const database = 'index';

function update_address(hash, blockheight, txid, amount, type, cb)
{
	const addr_inc = {};
	if (hash === 'coinbase')
	{
		addr_inc.sent = amount;
	}
	else
	{
		if (type === 'vin')
		{
			addr_inc.sent = amount;
			addr_inc.balance = -amount;
		}
		else
		{
			addr_inc.received = amount;
			addr_inc.balance = amount;
		}
	}
	Address.findOneAndUpdate({a_id: hash}, {$inc: addr_inc}, {new: true, upsert: true})
		.then(() =>
		{
			if (hash !== 'coinbase')
			{
				return AddressTx.findOneAndUpdate(
					{a_id: hash, txid: txid},
					{$inc: {amount: addr_inc.balance}, $set: {a_id: hash, blockindex: blockheight, txid: txid}},
					{new: true, upsert: true}
				);
			}
			else
			{
				return null;
			}
		})
		.then(() => cb())
		.catch(err => cb(err));
}

function create_lock(lockfile, cb)
{
	if (settings.lock_during_index === true)
	{
		var fname = './tmp/' + lockfile + '.pid';
		fs.appendFile(fname, process.pid.toString(), function (err)
		{
			if (err)
			{
				console.log("Error: unable to create %s", fname);
				process.exit(1);
			}
			else
			{
				return cb();
			}
		});
	}
	else
	{
		return cb();
	}
}

function remove_lock(lockfile, cb)
{
	if (settings.lock_during_index === true)
	{
		var fname = './tmp/' + lockfile + '.pid';
		fs.unlink(fname, function (err)
		{
			if (err)
			{
				console.log("unable to remove lock: %s", fname);
				process.exit(1);
			}
			else
			{
				return cb();
			}
		});
	}
	else
	{
		return cb();
	}
}

function is_locked(lockfile, cb)
{
	if (settings.lock_during_index === true)
	{
		const fname = './tmp/' + lockfile + '.pid';
		fs.exists(fname, function (exists)
		{
			return cb(exists);
		});
	}
	else
	{
		return cb(false);
	}
}

function exit()
{
	remove_lock(function ()
	{
		process.exit(0);
	});
}

let dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

is_locked("db_index", function (exists)
{
	if (exists)
	{
		console.log("Script already running..");
		process.exit(0);
	}
	else
	{
		create_lock("db_index", function ()
		{
			console.log("script launched with pid: " + process.pid);
			mongoose.connect(dbString)
				.then(() =>
				{
					if (database == 'index')
					{
						db.check_stats(settings.coin, function (exists)
						{
							if (exists == false)
							{
								console.log('Run \'npm start\' to create database structures before running this script.');
								exit();
							}
							else
							{
								db.update_db(settings.coin, function (stats)
								{
									if (settings.heavy == true)
									{
										db.update_heavy(settings.coin, stats.count, 20, function ()
										{
											// Heavy update finished
										});
									}
									if (mode == 'reindex')
									{
										Tx.deleteMany({}, function (err)
										{
											console.log('TXs cleared.');
											Address.deleteMany({}, function (err2)
											{
												console.log('Addresses cleared.');
												AddressTx.deleteMany({}, function (err3)
												{
													console.log('Address TXs cleared.');
													Richlist.updateOne({coin: settings.coin}, {
														received: [],
														balance: [],
													}, function (err3)
													{
														Stats.updateOne({coin: settings.coin}, {
															last: 0,
															count: 0,
															supply: 0,
														}, function ()
														{
															console.log('index cleared (reindex)');
														});
														db.update_tx_db(settings.coin, 1, stats.count, settings.update_timeout, function ()
														{
															db.update_richlist('received', function ()
															{
																db.update_richlist('balance', function ()
																{
																	db.get_stats(settings.coin, function (nstats)
																	{
																		console.log('reindex complete (block: %s)', nstats.last);
																		exit();
																	});
																});
															});
														});
													});
												});
											});
										});
									}
									else if (mode == 'check')
									{
										db.update_tx_db(settings.coin, 1, stats.count, settings.check_timeout, function ()
										{
											db.get_stats(settings.coin, function (nstats)
											{
												console.log('check complete (block: %s)', nstats.last);
												exit();
											});
										});
									}
									else if (mode == 'update')
									{
										db.update_tx_db(settings.coin, stats.last, stats.count, settings.update_timeout, function ()
										{
											db.update_richlist('received', function ()
											{
												db.update_richlist('balance', function ()
												{
													db.get_stats(settings.coin, function (nstats)
													{
														console.log('update complete (block: %s)', nstats.last);
														exit();
													});
												});
											});
										});
									}
									else if (mode == 'reindex-rich')
									{
										console.log('update started');
										db.update_tx_db(settings.coin, stats.last, stats.count, settings.check_timeout, function ()
										{
											console.log('update finished');
											db.check_richlist(settings.coin, function (exists)
											{
												if (exists == true)
												{
													console.log('richlist entry found, deleting now..');
												}
												db.delete_richlist(settings.coin, function (deleted)
												{
													if (deleted == true)
													{
														console.log('richlist entry deleted');
													}
													db.create_richlist(settings.coin, function ()
													{
														console.log('richlist created.');
														db.update_richlist('received', function ()
														{
															console.log('richlist updated received.');
															db.update_richlist('balance', function ()
															{
																console.log('richlist updated balance.');
																db.get_stats(settings.coin, function (nstats)
																{
																	console.log('update complete (block: %s)', nstats.last);
																	exit();
																});
															});
														});
													});
												});
											});
										});
									}
								});
							}
						});
					}
					else
					{
						// update markets
						const markets = settings.markets.enabled;
						let complete = 0;
						for (let x = 0; x < markets.length; x++)
						{
							const market = markets[x];
							db.check_market(market, function (mkt, exists)
							{
								if (exists)
								{
									db.update_markets_db(mkt, function (err)
									{
										if (!err)
										{
											console.log('%s market data updated successfully.', mkt);
											complete++;
											if (complete == markets.length)
											{
												exit();
											}
										}
										else
										{
											console.log('%s: %s', mkt, err);
											complete++;
											if (complete == markets.length)
											{
												exit();
											}
										}
									});
								}
								else
								{
									console.log('error: entry for %s does not exists in markets db.', mkt);
									complete++;
									if (complete == markets.length)
									{
										exit();
									}
								}
							});
						}
					}
				})
				.catch((err) =>
				{
					console.log('Unable to connect to database: %s, error: %s', dbString, err);
					console.log('Aborting');
					process.exit(1);
				});
		});
	}
});
