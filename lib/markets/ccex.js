const axios = require('axios');
const base_url = 'https://c-cex.com/t/';

let d1 = new Date();
let d2 = new Date();
d1.setDate(d1.getDate() - 2);

function pad(x)
{
	if (x < 10)
	{
		return "0" + x;
	}
	return x;
}

function toTimestamp(strDate)
{
	let datum = Date.parse(strDate);
	return datum / 1000;
}

function formatdate(date1)
{
	return date1.getUTCFullYear() + '-' + pad(date1.getUTCMonth() + 1) + '-' + pad(date1.getUTCDate());
}

function sleep9s()
{
	let start = new Date().getTime();
	for (let i = 0; i < 1e9; i++)
	{
		if ((new Date().getTime() - start) > 59000)
		{
			break;
		}
	}
}

function get_summary(coin, exchange, cb)
{
	let summary = {};
	sleep9s();
	const url1 = base_url + 's.html?a=volume&h=24&pair=' + coin + '-' + exchange;
	axios.get(url1)
		.then(response =>
		{
			let body = response.data;
			if (body.return !== undefined)
			{
				let i = body.return.length - 1;
				summary['volume'] = body.return[i]['volume_' + coin].toFixed(8);
				summary['volume_btc'] = body.return[i]['volume_' + exchange].toFixed(8);
				sleep9s();
				const url2 = base_url + '/' + coin + '-' + exchange + '.json';
				axios.get(url2)
					.then(response2 =>
					{
						let body2 = response2.data;
						if (body2 !== undefined && body2.ticker !== undefined)
						{
							summary['bid'] = body2.ticker['buy'].toFixed(8);
							summary['ask'] = body2.ticker['sell'].toFixed(8);
							summary['high'] = body2.ticker['high'].toFixed(8);
							summary['low'] = body2.ticker['low'].toFixed(8);
							summary['last'] = body2.ticker['lastprice'].toFixed(8);
							return cb(null, summary);
						}
						else
						{
							return cb(new Error('Ticker data is undefined'), null);
						}
					})
					.catch(error =>
					{
						return cb(error, null);
					});
			}
			else
			{
				return cb(new Error('Response has no return data'), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = base_url + 's.html?a=tradehistory&d1=' + formatdate(d1) + '&d2=' + formatdate(d2) + '&pair=' + coin + '-' + exchange;
	sleep9s();
	axios.get(req_url)
		.then(response =>
		{
			let body = response.data;
			if (body.return !== undefined)
			{
				let tTrades = body.return;
				let trades = [];
				if (tTrades === "No trade history for this period")
				{
					return cb(tTrades, null);
				}
				else
				{
					for (let i = 0; i < tTrades.length; i++)
					{
						let Trade = {
							ordertype: tTrades[i].type,
							amount: parseFloat(tTrades[i].amount).toFixed(8),
							price: parseFloat(tTrades[i].rate).toFixed(8),
							total: (parseFloat(tTrades[i].amount).toFixed(8) * parseFloat(tTrades[i].rate)).toFixed(8),
							datetime: tTrades[i].datetime,
							timestamp: toTimestamp(tTrades[i].datetime + 'Z'),
							backrate: tTrades[i].backrate
						};
						trades.push(Trade);
					}
					return cb(null, trades);
				}
			}
			else
			{
				return cb(body.message || new Error('No trade history data'), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, ccex_key, cb)
{
	const req_url = base_url + 'r.html?key=' + ccex_key + '&a=orderlist&self=0&pair=' + coin + '-' + exchange;
	sleep9s();
	axios.get(req_url)
		.then(response =>
		{
			let body = response.data;
			if (body !== undefined)
			{
				let orders = body;
				orders.Data = body['return'];
				let buys = [];
				let sells = [];
				for (let key in orders.Data)
				{
					if (orders.Data.hasOwnProperty(key))
					{
						let item = orders.Data[key];
						let order = {
							otype: item.type,
							amount: parseFloat(item.amount.toFixed(8)),
							price: parseFloat(item.price).toFixed(8),
							total: (parseFloat(item.amount) * parseFloat(item.price)).toFixed(8)
						};
						if (order.otype === 'buy')
						{
							buys.push(order);
						}
						else
						{
							sells.push(order);
						}
					}
				}
				return cb(null, buys, sells);
			}
			else
			{
				return cb(body.message || new Error('No orders data'), [], []);
			}
		})
		.catch(error =>
		{
			return cb(error, [], []);
		});
}

module.exports = {
	get_data: function (settings, cb)
	{
		let error = null;
		get_orders(settings.coin, settings.exchange, settings.ccex_key, function (err, buys, sells)
		{
			if (err)
			{
				error = err;
			}
			get_trades(settings.coin, settings.exchange, function (err, trades)
			{
				if (err)
				{
					error = err;
				}
				get_summary(settings.coin, settings.exchange, function (err, stats)
				{
					if (err)
					{
						error = err;
					}
					return cb(error, {
						buys: buys,
						sells: sells,
						chartdata: [],
						trades: trades,
						stats: stats
					});
				});
			});
		});
	}
};
