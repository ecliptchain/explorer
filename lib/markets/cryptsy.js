const axios = require('axios');
const base_url = 'https://api.cryptsy.com/api/v2/markets';

function get_summary(coin, exchange, Crymktid, cb)
{
	let summary = {};
	axios.get(`${base_url}/${Crymktid}/ticker`)
		.then(response =>
		{
			const body = response.data;
			if (body.success === true)
			{
				summary['bid'] = parseFloat(body.data.bid).toFixed(8);
				summary['ask'] = parseFloat(body.data.ask).toFixed(8);
				axios.get(`${base_url}/${Crymktid}`)
					.then(response2 =>
					{
						const body2 = response2.data;
						if (body2.success === true)
						{
							summary['volume'] = body2.data['24hr'].volume;
							summary['volume_btc'] = body2.data['24hr'].volume_btc;
							summary['high'] = body2.data['24hr'].price_high;
							summary['low'] = body2.data['24hr'].price_low;
							summary['last'] = body2.data.last_trade.price;
							return cb(null, summary);
						}
						else
						{
							return cb(new Error("Ошибка при получении дополнительных данных"), null);
						}
					})
					.catch(error2 =>
					{
						return cb(error2, null);
					});
			}
			else
			{
				return cb(new Error("Ошибка при получении тикера"), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, Crymktid, cb)
{
	const req_url = `${base_url}/${Crymktid}/tradehistory?limit=100`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success === true)
			{
				return cb(null, body.data);
			}
			else
			{
				return cb(new Error(body.message), null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, Crymktid, cb)
{
	const req_url = `${base_url}/${Crymktid}/orderbook?type=both?limit=50`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success === true)
			{
				const orders = body.data;
				let buys = [];
				let sells = [];
				if (orders.buyorders && orders.buyorders.length > 0)
				{
					for (let i = 0; i < orders.buyorders.length; i++)
					{
						let order = {
							amount: parseFloat(orders.buyorders[i].quantity).toFixed(8),
							price: parseFloat(orders.buyorders[i].price).toFixed(8),
							total: (parseFloat(orders.buyorders[i].quantity).toFixed(8) * parseFloat(orders.buyorders[i].price)).toFixed(8)
						};
						buys.push(order);
					}
				}
				if (orders.sellorders && orders.sellorders.length > 0)
				{
					for (let i = 0; i < orders.sellorders.length; i++)
					{
						let order = {
							amount: parseFloat(orders.sellorders[i].quantity).toFixed(8),
							price: parseFloat(orders.sellorders[i].price).toFixed(8),
							total: (parseFloat(orders.sellorders[i].quantity).toFixed(8) * parseFloat(orders.sellorders[i].price)).toFixed(8)
						};
						sells.push(order);
					}
				}
				return cb(null, buys, sells);
			}
			else
			{
				return cb(new Error(body.message), [], []);
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
		get_orders(settings.coin, settings.exchange, settings.cryptsy_id, function (err, buys, sells)
		{
			if (err)
			{
				error = err;
			}
			get_trades(settings.coin, settings.exchange, settings.cryptsy_id, function (err, trades)
			{
				if (err)
				{
					error = err;
				}
				get_summary(settings.coin, settings.exchange, settings.cryptsy_id, function (err, stats)
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
