const axios = require('axios');

const base_url = 'https://bleutrade.com/api/v2/public';

function get_summary(coin, exchange, cb)
{
	const req_url = base_url + '/getmarketsummary?market=' + coin + '_' + exchange;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.message)
			{
				return cb(body.message, null);
			}
			else
			{
				body.result[0]['last'] = body.result[0].Last;
				return cb(null, body.result[0]);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = base_url + '/getmarkethistory?market=' + coin + '_' + exchange + '&count=50';
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success === "true")
			{
				return cb(null, body.result);
			}
			else
			{
				return cb(body.message, null);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = base_url + '/getorderbook?market=' + coin + '_' + exchange + '&type=all&depth=50';
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success === "true")
			{
				const orders = body.result;
				let buys = [];
				let sells = [];
				if (orders.buy && orders.buy.length > 0)
				{
					for (let i = 0; i < orders.buy.length; i++)
					{
						let order = {
							amount: parseFloat(orders.buy[i].Quantity).toFixed(8),
							price: parseFloat(orders.buy[i].Rate).toFixed(8),
							// Расчёт total для предотвращения ошибок с малыми объёмами
							total: (parseFloat(orders.buy[i].Quantity).toFixed(8) * parseFloat(orders.buy[i].Rate)).toFixed(8)
						};
						buys.push(order);
					}
				}
				if (orders.sell && orders.sell.length > 0)
				{
					for (let i = 0; i < orders.sell.length; i++)
					{
						let order = {
							amount: parseFloat(orders.sell[i].Quantity).toFixed(8),
							price: parseFloat(orders.sell[i].Rate).toFixed(8),
							total: (parseFloat(orders.sell[i].Quantity).toFixed(8) * parseFloat(orders.sell[i].Rate)).toFixed(8)
						};
						sells.push(order);
					}
				}
				sells = sells.reverse();
				return cb(null, buys, sells);
			}
			else
			{
				return cb(body.message, [], []);
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
