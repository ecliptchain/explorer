var mongoose = require('mongoose'),
	Stats = require('../models/stats'),
	Markets = require('../models/markets'),
	Address = require('../models/address'),
	AddressTx = require('../models/addresstx'),
	Tx = require('../models/tx'),
	Richlist = require('../models/richlist'),
	Peers = require('../models/peers'),
	Heavy = require('../models/heavy'),
	lib = require('./explorer'),
	settings = require('./settings'),
	fs = require('fs'),
	async = require('async');


function find_address(hash, cb)
{
	Address.findOne({a_id: hash})
		.then(address => cb(address))
		.catch(err =>
		{
			console.error(err);
			cb();
		});
}

function find_address_tx(address, hash, cb)
{
	AddressTx.findOne({a_id: address, txid: hash})
		.then(address_tx => cb(address_tx))
		.catch(err =>
		{
			console.error(err);
			cb();
		});
}

function find_richlist(coin, cb)
{
	Richlist.findOne({coin: coin})
		.then(richlist => cb(richlist))
		.catch(err =>
		{
			console.error(err);
			cb();
		});
}

function update_address(hash, blockheight, txid, amount, type, cb)
{
	var addr_inc = {};
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

function find_tx(txid, cb)
{
	Tx.findOne({txid: txid})
		.then(tx => cb(tx))
		.catch(err =>
		{
			console.error(err);
			cb(null);
		});
}

function save_tx(txid, blockheight, cb)
{
	lib.get_rawtransaction(txid, function (tx)
	{
		if (tx !== 'There was an error. Check your console.')
		{
			lib.prepare_vin(tx, function (vin)
			{
				lib.prepare_vout(tx.vout, txid, vin, function (vout, nvin)
				{
					lib.syncLoop(vin.length, function (loop)
					{
						var i = loop.iteration();
						update_address(nvin[i].addresses, blockheight, txid, nvin[i].amount, 'vin', function ()
						{
							loop.next();
						});
					}, function ()
					{
						lib.syncLoop(vout.length, function (subloop)
						{
							var t = subloop.iteration();
							if (vout[t].addresses)
							{
								update_address(vout[t].addresses, blockheight, txid, vout[t].amount, 'vout', function ()
								{
									subloop.next();
								});
							}
							else
							{
								subloop.next();
							}
						}, function ()
						{
							lib.calculate_total(vout, function (total)
							{
								var newTx = new Tx({
									txid: tx.txid,
									vin: nvin,
									vout: vout,
									total: total.toFixed(8),
									timestamp: tx.time,
									blockhash: tx.blockhash,
									blockindex: blockheight,
								});
								newTx.save()
									.then(() => cb())
									.catch(err => cb(err));
							});
						});
					});
				});
			});
		}
		else
		{
			return cb('tx not found: ' + txid);
		}
	});
}

function get_market_data(market, cb)
{
	if (fs.existsSync('./lib/markets/' + market + '.js'))
	{
		let exMarket = require('./markets/' + market);
		exMarket.get_data(settings.markets, function (err, obj)
		{
			return cb(err, obj);
		});
	}
	else
	{
		return cb(null);
	}
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
		var fname = './tmp/' + lockfile + '.pid';
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

module.exports = {
	connect: function (database, cb)
	{
		mongoose.connect(database)
			.then(() => cb())
			.catch((err) =>
			{
				console.log('Unable to connect to database: %s, error: %s', database, err);
				console.log('Aborting');
				process.exit(1);
			});
	},

	is_locked: function (cb)
	{
		is_locked("db_index", function (exists)
		{
			return cb(exists);
		});
	},

	update_label: function (hash, message, cb)
	{
		find_address(hash, function (address)
		{
			if (address)
			{
				Address.updateOne({a_id: hash}, {name: message})
					.then(() => cb())
					.catch(err =>
					{
						console.error(err);
						cb(err);
					});
			}
			else
			{
				return cb();
			}
		});
	},

	check_stats: function (coin, cb)
	{
		Stats.findOne({coin: coin})
			.then(stats => cb(!!stats))
			.catch(err =>
			{
				console.error(err);
				cb(false);
			});
	},

	get_stats: function (coin, cb)
	{
		Stats.findOne({coin: coin})
			.then(stats => cb(stats || null))
			.catch(err =>
			{
				console.error(err);
				cb(null);
			});
	},

	create_stats: function (coin, cb)
	{
		var newStats = new Stats({
			coin: coin,
			last: 0,
		});
		newStats.save()
			.then(() =>
			{
				console.log("initial stats entry created for %s", coin);
				cb();
			})
			.catch(err =>
			{
				console.log(err);
				cb();
			});
	},

	get_address: function (hash, cb)
	{
		find_address(hash, function (address)
		{
			return cb(address);
		});
	},

	get_richlist: function (coin, cb)
	{
		find_richlist(coin, function (richlist)
		{
			return cb(richlist);
		});
	},

	update_richlist: function (list, cb)
	{
		if (list === 'received')
		{
			Address.find({}, 'a_id balance received name')
				.sort({received: 'desc'})
				.limit(100)
				.then(addresses =>
				{
					return Richlist.updateOne({coin: settings.coin}, {received: addresses});
				})
				.then(() => cb())
				.catch(err =>
				{
					console.error(err);
					cb(err);
				});
		}
		else
		{ // balance
			Address.find({}, 'a_id balance received name')
				.sort({balance: 'desc'})
				.limit(100)
				.then(addresses =>
				{
					return Richlist.updateOne({coin: settings.coin}, {balance: addresses});
				})
				.then(() => cb())
				.catch(err =>
				{
					console.error(err);
					cb(err);
				});
		}
	},

	get_tx: function (txid, cb)
	{
		find_tx(txid, function (tx)
		{
			return cb(tx);
		});
	},

	get_txs: function (block, cb)
	{
		var txs = [];
		lib.syncLoop(block.tx.length, function (loop)
		{
			var i = loop.iteration();
			find_tx(block.tx[i], function (tx)
			{
				if (tx)
				{
					txs.push(tx);
				}
				loop.next();
			});
		}, function ()
		{
			return cb(txs);
		});
	},

	create_txs: function (block, cb)
	{
		is_locked("db_index", function (exists)
		{
			if (exists)
			{
				console.log("db_index lock file exists...");
				return cb();
			}
			else
			{
				lib.syncLoop(block.tx.length, function (loop)
				{
					var i = loop.iteration();
					save_tx(block.tx[i], block.height, function (err)
					{
						if (err)
						{
							loop.next();
						}
						else
						{
							//console.log('tx stored: %s', block.tx[i]);
							loop.next();
						}
					});
				}, function ()
				{
					return cb();
				});
			}
		});
	},

	get_last_txs_ajax: function (start, length, min, cb)
	{
		Tx.countDocuments({total: {$gte: min}})
			.then(count =>
			{
				Tx.find({total: {$gte: min}})
					.sort({blockindex: -1})
					.skip(Number(start))
					.limit(Number(length))
					.then(txs =>
					{
						return cb(txs, count);
					})
					.catch(err => cb(err));
			})
			.catch(err => cb(err));
	},

	get_address_txs_ajax: function (hash, start, length, cb)
	{
		var totalCount = 0;
		AddressTx.countDocuments({a_id: hash})
			.then(count =>
			{
				totalCount = count;
				return AddressTx.aggregate([
					{$match: {a_id: hash}},
					{$sort: {blockindex: -1}},
					{$skip: Number(start)},
					{
						$group: {
							_id: '',
							balance: {$sum: '$amount'}
						}
					},
					{
						$project: {_id: 0, balance: '$balance'}
					},
					{$sort: {blockindex: -1}}
				]);
			})
			.then(balance_sum =>
			{
				AddressTx.find({a_id: hash})
					.sort({blockindex: -1})
					.skip(Number(start))
					.limit(Number(length))
					.then(address_tx =>
					{
						var txs = [];
						var count = address_tx.length;
						var running_balance = balance_sum.length > 0 ? balance_sum[0].balance : 0;
						lib.syncLoop(count, function (loop)
						{
							var i = loop.iteration();
							find_tx(address_tx[i].txid, function (tx)
							{
								if (tx && !txs.includes(tx))
								{
									tx.balance = running_balance;
									txs.push(tx);
									loop.next();
								}
								else if (!txs.includes(tx))
								{
									txs.push("1. Not found");
									loop.next();
								}
								else
								{
									loop.next();
								}
								running_balance = running_balance - address_tx[i].amount;
							});
						}, function ()
						{
							return cb(txs, totalCount);
						});
					})
					.catch(err => cb(err));
			})
			.catch(err => cb(err));
	},

	create_market: function (coin, exchange, market, cb)
	{
		var newMarkets = new Markets({
			market: market,
			coin: coin,
			exchange: exchange,
		});
		newMarkets.save()
			.then(() =>
			{
				console.log("initial markets entry created for %s", market);
				return cb();
			})
			.catch(err =>
			{
				console.log(err);
				return cb();
			});
	},

	check_market: function (market, cb)
	{
		Markets.findOne({market: market})
			.then(exists =>
			{
				if (exists)
				{
					return cb(market, true);
				}
				else
				{
					return cb(market, false);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(market, false);
			});
	},

	get_market: function (market, cb)
	{
		Markets.findOne({market: market})
			.then(data =>
			{
				if (data)
				{
					return cb(data);
				}
				else
				{
					return cb(null);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(null);
			});
	},

	create_richlist: function (coin, cb)
	{
		var newRichlist = new Richlist({coin: coin});
		newRichlist.save()
			.then(() =>
			{
				console.log("initial richlist entry created for %s", coin);
				return cb();
			})
			.catch(err =>
			{
				console.log(err);
				return cb();
			});
	},

	delete_richlist: function (coin, cb)
	{
		Richlist.findOneAndRemove({coin: coin})
			.then(exists =>
			{
				if (exists)
				{
					return cb(true);
				}
				else
				{
					return cb(false);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(false);
			});
	},

	check_richlist: function (coin, cb)
	{
		Richlist.findOne({coin: coin})
			.then(exists =>
			{
				if (exists)
				{
					return cb(true);
				}
				else
				{
					return cb(false);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(false);
			});
	},

	create_heavy: function (coin, cb)
	{
		var newHeavy = new Heavy({coin: coin});
		newHeavy.save()
			.then(() =>
			{
				console.log("initial heavy entry created for %s", coin);
				console.log(newHeavy);
				return cb();
			})
			.catch(err =>
			{
				console.log(err);
				return cb();
			});
	},

	check_heavy: function (coin, cb)
	{
		Heavy.findOne({coin: coin})
			.then(exists =>
			{
				if (exists)
				{
					return cb(true);
				}
				else
				{
					return cb(false);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(false);
			});
	},

	get_heavy: function (coin, cb)
	{
		Heavy.findOne({coin: coin})
			.then(heavy =>
			{
				if (heavy)
				{
					return cb(heavy);
				}
				else
				{
					return cb(null);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(null);
			});
	},

	get_distribution: function (richlist, stats, cb)
	{
		var distribution = {
			supply: stats.supply,
			t_1_25: {percent: 0, total: 0},
			t_26_50: {percent: 0, total: 0},
			t_51_75: {percent: 0, total: 0},
			t_76_100: {percent: 0, total: 0},
			t_101plus: {percent: 0, total: 0}
		};
		lib.syncLoop(richlist.balance.length, function (loop)
		{
			var i = loop.iteration();
			var count = i + 1;
			var percentage = ((richlist.balance[i].balance / 100000000) / stats.supply) * 100;
			if (count <= 25)
			{
				distribution.t_1_25.percent += percentage;
				distribution.t_1_25.total += (richlist.balance[i].balance / 100000000);
			}
			if (count <= 50 && count > 25)
			{
				distribution.t_26_50.percent += percentage;
				distribution.t_26_50.total += (richlist.balance[i].balance / 100000000);
			}
			if (count <= 75 && count > 50)
			{
				distribution.t_51_75.percent += percentage;
				distribution.t_51_75.total += (richlist.balance[i].balance / 100000000);
			}
			if (count <= 100 && count > 75)
			{
				distribution.t_76_100.percent += percentage;
				distribution.t_76_100.total += (richlist.balance[i].balance / 100000000);
			}
			loop.next();
		}, function ()
		{
			distribution.t_101plus.percent = parseFloat(100 - distribution.t_76_100.percent - distribution.t_51_75.percent - distribution.t_26_50.percent - distribution.t_1_25.percent).toFixed(2);
			distribution.t_101plus.total = parseFloat(distribution.supply - distribution.t_76_100.total - distribution.t_51_75.total - distribution.t_26_50.total - distribution.t_1_25.total).toFixed(8);
			distribution.t_1_25.percent = parseFloat(distribution.t_1_25.percent).toFixed(2);
			distribution.t_1_25.total = parseFloat(distribution.t_1_25.total).toFixed(8);
			distribution.t_26_50.percent = parseFloat(distribution.t_26_50.percent).toFixed(2);
			distribution.t_26_50.total = parseFloat(distribution.t_26_50.total).toFixed(8);
			distribution.t_51_75.percent = parseFloat(distribution.t_51_75.percent).toFixed(2);
			distribution.t_51_75.total = parseFloat(distribution.t_51_75.total).toFixed(8);
			distribution.t_76_100.percent = parseFloat(distribution.t_76_100.percent).toFixed(2);
			distribution.t_76_100.total = parseFloat(distribution.t_76_100.total).toFixed(8);
			return cb(distribution);
		});
	},

	update_heavy: function (coin, height, count, cb)
	{
		var newVotes = [];
		lib.get_maxmoney(function (maxmoney)
		{
			lib.get_maxvote(function (maxvote)
			{
				lib.get_vote(function (vote)
				{
					lib.get_phase(function (phase)
					{
						lib.get_reward(function (reward)
						{
							lib.get_supply(function (supply)
							{
								lib.get_estnext(function (estnext)
								{
									lib.get_nextin(function (nextin)
									{
										lib.syncLoop(count, function (loop)
										{
											var i = loop.iteration();
											lib.get_blockhash(height - i, function (hash)
											{
												lib.get_block(hash, function (block)
												{
													newVotes.push({
														count: height - i,
														reward: block.reward,
														vote: block.vote
													});
													loop.next();
												});
											});
										}, function ()
										{
											console.log(newVotes);
											Heavy.updateOne({coin: coin}, {
												lvote: vote,
												reward: reward,
												supply: supply,
												cap: maxmoney,
												estnext: estnext,
												phase: phase,
												maxvote: maxvote,
												nextin: nextin,
												votes: newVotes,
											})
												.then(() => cb())
												.catch(err =>
												{
													console.error(err);
													cb(err);
												});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	},

	update_markets_db: function (market, cb)
	{
		get_market_data(market, function (err, obj)
		{
			if (err == null)
			{
				Markets.updateOne({market: market}, {
					chartdata: JSON.stringify(obj.chartdata),
					buys: obj.buys,
					sells: obj.sells,
					history: obj.trades,
					summary: obj.stats,
				})
					.then(() =>
					{
						if (market === settings.markets.default)
						{
							Stats.updateOne({coin: settings.coin}, {last_price: obj.stats.last})
								.then(() => cb(null))
								.catch(err => cb(err));
						}
						else
						{
							return cb(null);
						}
					})
					.catch(err => cb(err));
			}
			else
			{
				return cb(err);
			}
		});
	},

	update_db: function (coin, cb)
	{
		lib.get_blockcount(function (count)
		{
			if (!count)
			{
				console.log('Unable to connect to explorer API');
				return cb(false);
			}
			lib.get_supply(function (supply)
			{
				lib.get_connectioncount(function (connections)
				{
					Stats.findOneAndUpdate({coin: coin}, {
						$set: {
							coin: coin,
							count: count,
							supply: supply,
							connections: connections
						}
					}, {new: true})
						.then(new_stats =>
						{
							return cb({
								coin: coin,
								count: count,
								supply: supply,
								connections: connections,
								last: (new_stats.last ? new_stats.last : 0)
							});
						})
						.catch(err =>
						{
							console.log("Error during Stats Update:", err);
							return cb(false);
						});
				});
			});
		});
	},

	update_tx_db: function (coin, start, end, timeout, cb)
	{
		is_locked("db_index", function (exists)
		{
			if (exists)
			{
				console.log("db_index lock file exists...");
				return cb();
			}
			else
			{
				create_lock("db_index", function ()
				{
					if (start < 1)
					{
						start = 1;
					}
					var blocks_to_scan = [];
					var task_limit_blocks = settings.block_parallel_tasks;
					if (task_limit_blocks < 1)
					{
						task_limit_blocks = 1;
					}
					var task_limit_txs = 1;
					for (var i = start; i < (end + 1); i++)
					{
						blocks_to_scan.push(i);
					}
					async.eachLimit(blocks_to_scan, task_limit_blocks, function (block_height, next_block)
					{
						if (block_height % 5000 === 0)
						{
							Stats.updateOne({coin: coin}, {
								last: block_height - 1,
								last_txs: ''
							}).exec();
						}
						lib.get_blockhash(block_height, function (blockhash)
						{
							if (blockhash)
							{
								lib.get_block(blockhash, function (block)
								{
									if (block)
									{
										async.eachLimit(block.tx, task_limit_txs, function (txid, next_tx)
										{
											Tx.findOne({txid: txid})
												.then(tx =>
												{
													if (tx)
													{
														setTimeout(function ()
														{
															tx = null;
															next_tx();
														}, timeout);
													}
													else
													{
														save_tx(txid, block_height, function (err)
														{
															if (err)
															{
																console.log(err);
															}
															else
															{
																console.log('%s: %s', block_height, txid);
															}
															setTimeout(function ()
															{
																tx = null;
																next_tx();
															}, timeout);
														});
													}
												})
												.catch(err =>
												{
													console.log(err);
													next_tx();
												});
										}, function ()
										{
											setTimeout(function ()
											{
												blockhash = null;
												block = null;
												next_block();
											}, timeout);
										});
									}
									else
									{
										console.log('block not found: %s', blockhash);
										setTimeout(function ()
										{
											next_block();
										}, timeout);
									}
								});
							}
							else
							{
								setTimeout(function ()
								{
									next_block();
								}, timeout);
							}
						});
					}, function ()
					{
						Tx.find({}).sort({timestamp: 'desc'}).limit(settings.index.last_txs)
							.then(txs =>
							{
								Stats.updateOne({coin: coin}, {
									last: end,
									last_txs: ''
								})
									.then(() =>
									{
										remove_lock("db_index", function ()
										{
											return cb();
										});
									})
									.catch(err =>
									{
										console.log(err);
										remove_lock("db_index", function ()
										{
											return cb();
										});
									});
							})
							.catch(err =>
							{
								console.log(err);
								remove_lock("db_index", function ()
								{
									return cb();
								});
							});
					});
				});
			}
		});
	},

	create_peer: function (params, cb)
	{
		var newPeer = new Peers(params);
		newPeer.save()
			.then(() => cb())
			.catch(err =>
			{
				console.log(err);
				cb();
			});
	},

	find_peer: function (address, cb)
	{
		Peers.findOne({address: address})
			.then(peer =>
			{
				if (peer)
				{
					return cb(peer);
				}
				else
				{
					return cb(null);
				}
			})
			.catch(err =>
			{
				console.error(err);
				return cb(null);
			});
	},

	drop_peer: function (address, cb)
	{
		Peers.deleteOne({address: address})
			.then(() => cb())
			.catch(err =>
			{
				console.log(err);
				cb();
			});
	},

	drop_peers: function (cb)
	{
		Peers.deleteMany({})
			.then(() => cb())
			.catch(err =>
			{
				console.log(err);
				cb();
			});
	},

	get_peers: function (cb)
	{
		Peers.find({})
			.then(peers => cb(peers))
			.catch(err =>
			{
				console.error(err);
				cb([]);
			});
	}
};
