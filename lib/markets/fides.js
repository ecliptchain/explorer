const axios = require('axios');
const crypto = require('crypto');
const base_url = 'https://node1.fides-ex.com';

function get_summary(coin, exchange, cb)
{
	const url = `${base_url}/market/get-market-summary/${exchange.toUpperCase()}_${coin.toUpperCase()}`;
	axios.get(url)
		.then(response =>
		{
			const body = response.data;
			if (body.error !== true)
			{
				let summary = {};
				summary['ask'] = parseFloat(body.data.LowestAsk).toFixed(8);
				summary['bid'] = parseFloat(body.data.HeighestBid).toFixed(8);
				summary['volume'] = parseFloat(body.data.QuoteVolume).toFixed(8);
				summary['volume_btc'] = parseFloat(body.data.BaseVolume).toFixed(8);
				summary['high'] = parseFloat(body.data.High_24hr).toFixed(8);
				summary['low'] = parseFloat(body.data.Low_24hr).toFixed(8);
				summary['last'] = parseFloat(body.data.Last).toFixed(8);
				summary['change'] = parseFloat(body.data.PercentChange);
				return cb(null, summary);
			}
			else
			{
				return cb(new Error("Ошибка в ответе get_summary"), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = `${base_url}/market/get-trade-history/${exchange.toUpperCase()}_${coin.toUpperCase()}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error)
			{
				return cb(body.error, []);
			}
			else
			{
				return cb(null, body.data);
			}
		})
		.catch(error =>
		{
			return cb(error, []);
		});
}

function get_orders_side(coin, exchange, side, cb)
{
	const req_url = `${base_url}/market/get-open-orders/${exchange.toUpperCase()}_${coin.toUpperCase()}/${side.toUpperCase()}/10`;
	console.log("sending request to - " + req_url);
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error !== true)
			{
				let orders = [];
				if (body.data && body.data.Orders && body.data.Orders.length > 0)
				{
					for (let i = 0; i < body.data.Orders.length; i++)
					{
						let order = {
							MarketType: body.data.Orders[i].MarketType,
							CurrencyType: body.data.Orders[i].CurrencyType,
							Type: body.data.Type,
							Pair: body.data.Pair,
							Rate: body.data.Orders[i].Rate,
							Volume: body.data.Orders[i].Volume,
							Total: body.data.Orders[i].Rate * body.data.Orders[i].Volume
						};
						orders.push(order);
					}
					return cb(null, orders);
				}
				else
				{
					return cb(null, []);
				}
			}
			else
			{
				return cb(new Error("Ошибка в ответе get_orders_side"), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	get_orders_side(coin, exchange, "buy", function (err, buys)
	{
		if (err)
		{
			return cb(err, [], []);
		}
		get_orders_side(coin, exchange, "sell", function (err, sells)
		{
			if (err)
			{
				return cb(err, buys, []);
			}
			return cb(null, buys, sells);
		});
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
