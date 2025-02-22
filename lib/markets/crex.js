const axios = require('axios');
const base_url = 'https://api.crex24.com/v2/public';

function get_summary(coin, exchange, cb)
{
	const url = base_url + '/tickers?instrument=' + coin.toUpperCase() + '-' + exchange.toUpperCase();
	axios.get(url)
		.then(response =>
		{
			const body = response.data;
			if (body.error !== true)
			{
				let summary = {};
				summary['ask'] = parseFloat(body[0]['ask']).toFixed(8);
				summary['bid'] = parseFloat(body[0]['bid']).toFixed(8);
				summary['volume'] = parseFloat(body[0]['baseVolume']).toFixed(8);
				summary['volume_btc'] = parseFloat(body[0]['volumeInBtc']).toFixed(8);
				summary['high'] = parseFloat(body[0]['high']).toFixed(8);
				summary['low'] = parseFloat(body[0]['low']).toFixed(8);
				summary['last'] = parseFloat(body[0]['last']).toFixed(8);
				summary['change'] = parseFloat(body[0]['percentChange']);
				return cb(null, summary);
			}
			else
			{
				return cb(new Error("Error in response"), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = base_url + '/recentTrades?instrument=' + coin.toUpperCase() + '-' + exchange.toUpperCase();
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error !== true)
			{
				let tTrades = body;
				let trades = [];
				for (let i = 0; i < tTrades.length; i++)
				{
					let Trade = {
						orderpair: tTrades[i].Label,
						ordertype: tTrades[i].side,
						amount: parseFloat(tTrades[i].volume).toFixed(8),
						price: parseFloat(tTrades[i].price).toFixed(8),
						total: (parseFloat(tTrades[i].volume).toFixed(8) * parseFloat(tTrades[i].price)).toFixed(8),
						timestamp: parseInt((new Date(tTrades[i].timestamp).getTime() / 1000).toFixed(0))
					};
					trades.push(Trade);
				}
				return cb(null, trades);
			}
			else
			{
				return cb(body.Message, null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = base_url + '/orderBook?instrument=' + coin.toUpperCase() + '-' + exchange.toUpperCase();
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error !== true)
			{
				const buyorders = body['buyLevels'];
				const sellorders = body['sellLevels'];
				let buys = [];
				let sells = [];
				if (buyorders && buyorders.length > 0)
				{
					for (let i = 0; i < buyorders.length; i++)
					{
						let order = {
							amount: parseFloat(buyorders[i].volume).toFixed(8),
							price: parseFloat(buyorders[i].price).toFixed(8),
							total: (parseFloat(buyorders[i].volume).toFixed(8) * parseFloat(buyorders[i].price)).toFixed(8)
						};
						buys.push(order);
					}
				}
				if (sellorders && sellorders.length > 0)
				{
					for (let i = 0; i < sellorders.length; i++)
					{
						let order = {
							amount: parseFloat(sellorders[i].volume).toFixed(8),
							price: parseFloat(sellorders[i].price).toFixed(8),
							total: (parseFloat(sellorders[i].volume).toFixed(8) * parseFloat(sellorders[i].price)).toFixed(8)
						};
						sells.push(order);
					}
				}
				return cb(null, buys, sells);
			}
			else
			{
				return cb(body.Message, [], []);
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
		get_orders(settings.coin, settings.exchange, function (err, buys, sells)
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
					return cb(error, {buys: buys, sells: sells, chartdata: [], trades: trades, stats: stats});
				});
			});
		});
	}
};
