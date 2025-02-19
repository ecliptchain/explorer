const fetch = require('node-fetch');

const base_url = 'https://yobit.io/api/3';

async function fetchData(url)
{
	try
	{
		const response = await fetch(url);
		if (!response.ok)
		{
			throw new Error(`HTTP Error: ${response.status}`);
		}
		const body = await response.json();
		if (body.success === 0 || body.error)
		{
			throw new Error(body.error || "Unknown API error");
		}
		return body;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

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

async function get_orders(coin, exchange)
{
	const url = `${base_url}/depth/${coin}_${exchange}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {buys: [], sells: [], error: `No order book data available for ${coin}-${exchange}`};
	}

	return {
		buys: body[`${coin}_${exchange}`]['bids'] || [],
		sells: body[`${coin}_${exchange}`]['asks'] || []
	};
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
