const axios = require('axios');

const base_url = 'https://bleutrade.com/api/v2/public';

async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		if (!response.data || !response.data.success)
		{
			throw new Error(response.data.message || 'Unknown API error');
		}
		return response.data.result;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

async function get_summary(coin, exchange)
{
	const req_url = `${base_url}/getmarketsummary?market=${coin}_${exchange}`;
	const result = await fetchData(req_url);
	if (!result || result.length === 0)
	{
		return {error: "No market summary data available"};
	}

	return {
		last: result[0].Last,
		high: result[0].High,
		low: result[0].Low,
		volume: result[0].Volume,
		bid: result[0].Bid,
		ask: result[0].Ask,
		open: result[0].OpenBuyOrders,
		close: result[0].OpenSellOrders
	};
}

async function get_trades(coin, exchange)
{
	const req_url = `${base_url}/getmarkethistory?market=${coin}_${exchange}&count=50`;
	return await fetchData(req_url) || {error: "No trade history available"};
}

async function get_orders(coin, exchange)
{
	const req_url = `${base_url}/getorderbook?market=${coin}_${exchange}&type=all&depth=50`;
	const result = await fetchData(req_url);
	if (!result)
	{
		return {buys: [], sells: [], error: "No order book data available"};
	}

	const buys = result.buy?.map(order => ({
		amount: parseFloat(order.Quantity).toFixed(8),
		price: parseFloat(order.Rate).toFixed(8),
		total: (parseFloat(order.Quantity) * parseFloat(order.Rate)).toFixed(8)
	})) || [];

	const sells = result.sell?.map(order => ({
		amount: parseFloat(order.Quantity).toFixed(8),
		price: parseFloat(order.Rate).toFixed(8),
		total: (parseFloat(order.Quantity) * parseFloat(order.Rate)).toFixed(8)
	})) || [];

	return {buys, sells};
}

module.exports = {
	get_data: async function (settings, cb)
	{
		try
		{
			const [orders, trades, summary] = await Promise.all([
				get_orders(settings.coin, settings.exchange),
				get_trades(settings.coin, settings.exchange),
				get_summary(settings.coin, settings.exchange)
			]);

			return cb(null, {
				buys: orders.buys,
				sells: orders.sells,
				chartdata: [],
				trades,
				stats: summary
			});
		}
		catch (error)
		{
			console.error("Error in get_data:", error);
			return cb(error, null);
		}
	}
};
