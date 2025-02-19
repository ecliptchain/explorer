const axios = require('axios');

const base_url = 'https://api.empoex.com';

// Generalized fetch function with error handling
async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		return response.data;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

// Get market summary
async function get_summary(coin, exchange)
{
	const url = `${base_url}/marketinfo/${coin}-${exchange}`;
	const body = await fetchData(url);
	if (!body || body.length < 1)
	{
		return {error: `Pair not found: ${coin}-${exchange}`};
	}
	return body[0];
}

// Get trade history
async function get_trades(coin, exchange)
{
	const url = `${base_url}/markethistory/${coin}-${exchange}`;
	const body = await fetchData(url);
	if (!body || !body[`${coin}-${exchange}`])
	{
		return {error: `Pair not found: ${coin}-${exchange}`};
	}
	return body[`${coin}-${exchange}`];
}

// Get order book
async function get_orders(coin, exchange)
{
	const url = `${base_url}/orderbook/${coin}-${exchange}`;
	const body = await fetchData(url);
	if (!body || !body[`${coin}-${exchange}`])
	{
		return {
			buys: [],
			sells: [],
			error: `Pair not found: ${coin}-${exchange}`
		};
	}

	const {buy = [], sell = []} = body[`${coin}-${exchange}`];
	return {buys: buy, sells: sell};
}

// Export function to get all data
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
