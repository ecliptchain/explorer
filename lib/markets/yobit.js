const axios = require('axios');

const base_url = 'https://yobit.io/api/3';

// Generalized fetch function with error handling
async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		if (response.data.success === 0 || response.data.error)
		{
			throw new Error(response.data.error || "Unknown API error");
		}
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
	const url = `${base_url}/ticker/${coin}_${exchange}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `Pair not found: ${coin}-${exchange}`};
	}
	return body[`${coin}_${exchange}`];
}

// Get trade history
async function get_trades(coin, exchange)
{
	const url = `${base_url}/trades/${coin}_${exchange}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `No trade history found for ${coin}-${exchange}`};
	}
	return body[`${coin}_${exchange}`];
}

// Get order book
async function get_orders(coin, exchange)
{
	const url = `${base_url}/depth/${coin}_${exchange}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {buys: [], sells: [], error: `No order book data available for ${coin}-${exchange}`};
	}

	return {
		buys: body[`${coin}_${exchange}`]?.bids || [],
		sells: body[`${coin}_${exchange}`]?.asks || []
	};
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
