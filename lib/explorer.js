const axios = require('axios');
const settings = require('./settings');
const Address = require('../models/address');
const Client = require('bitcoin-core');

const client = new Client(settings.wallet);
const base_url = `http://127.0.0.1:${settings.port}/api/`;

// Fetch function with error handling
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

// Returns coinbase total sent as current coin supply
async function coinbase_supply()
{
	try
	{
		const address = await Address.findOne({a_id: 'coinbase'});
		return address ? address.sent : 0;
	}
	catch (err)
	{
		console.error("Error fetching coinbase supply:", err);
		return 0;
	}
}

// Executes an RPC command with error handling
async function rpcCommand(method, parameters = [])
{
	try
	{
		const response = await client.command([{method, parameters}]);
		if (response[0]?.name === 'RpcError')
		{
			console.error(`RPC Error in ${method}:`, response[0]);
			return 'There was an error. Check your console.';
		}
		return response[0];
	}
	catch (err)
	{
		console.error(`Error in RPC command ${method}:`, err);
		return 'There was an error. Check your console.';
	}
}

module.exports = {
	convert_to_satoshi: (amount) => parseInt(amount.toFixed(8).replace('.', ''), 10),

	get_hashrate: async function (cb)
	{
		if (!settings.index.show_hashrate)
		{
			cb('-');
			return;
		}

		let response;
		if (settings.use_rpc)
		{
			const method = settings.nethash === 'netmhashps' ? 'getmininginfo' : 'getnetworkhashps';
			response = await rpcCommand(method);
		}
		else
		{
			const url = base_url + (settings.nethash === 'netmhashps' ? 'getmininginfo' : 'getnetworkhashps');
			response = await fetchData(url);
		}

		if (!response || response === 'There was an error. Check your console.')
		{
			cb('-');
			return;
		}

		let hashRate = parseFloat(settings.nethash === 'netmhashps' ? response.netmhashps : response);
		const units = settings.nethash_units || 'H';

		const conversion = {
			K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, H: 1
		};

		cb((hashRate / (conversion[units] || 1)).toFixed(4));
	},

	get_difficulty: async (cb) => (settings.use_rpc ? rpcCommand('getdifficulty') : fetchData(base_url + 'getdifficulty')).then(res => cb(res)),

	get_connectioncount: async (cb) => (settings.use_rpc ? rpcCommand('getconnectioncount') : fetchData(base_url + 'getconnectioncount')).then(res => cb(res)),

	get_blockcount: async (cb) => (settings.use_rpc ? rpcCommand('getblockcount') : fetchData(base_url + 'getblockcount')).then(res => cb(res)),

	get_blockhash: async (height, cb) => (settings.use_rpc ? rpcCommand('getblockhash', [parseInt(height)]) : fetchData(`${base_url}getblockhash?height=${height}`)).then(res => cb(res)),

	get_block: async (hash, cb) => (settings.use_rpc ? rpcCommand('getblock', [hash]) : fetchData(`${base_url}getblock?hash=${hash}`)).then(res => cb(res)),

	get_rawtransaction: async (hash, cb) => (settings.use_rpc ? rpcCommand('getrawtransaction', [hash, 1]) : fetchData(`${base_url}getrawtransaction?txid=${hash}&decrypt=1`)).then(res => cb(res)),

	get_supply: async function (cb)
	{
		try
		{
			let result;
			if (!settings.use_rpc)
			{
				const sources = {
					HEAVY: 'getsupply',
					GETINFO: 'getinfo',
					BALANCES: 'balance_supply',
					TXOUTSET: 'gettxoutsetinfo'
				};
				if (sources[settings.supply])
				{
					result = await fetchData(base_url + sources[settings.supply]);
				}
				else
				{
					result = await coinbase_supply().then(supply => supply / 1e8);
				}
			}
			else
			{
				const rpc_sources = {
					HEAVY: 'getsupply',
					GETINFO: 'getinfo',
					BALANCES: 'balance_supply',
					TXOUTSET: 'gettxoutsetinfo'
				};
				if (rpc_sources[settings.supply])
				{
					const response = await rpcCommand(rpc_sources[settings.supply]);
					result = settings.supply === 'GETINFO' ? response.moneysupply : response.total_amount;
				}
				else
				{
					result = await coinbase_supply().then(supply => supply / 1e8);
				}
			}
			cb(null, result);
		}
		catch (err)
		{
			cb(err);
		}
	},

	syncLoop: function (iterations, process, exit)
	{
		var index = 0,
			done = false,
			shouldExit = false;
		var loop = {
			next: function ()
			{
				if (done)
				{
					if (shouldExit && exit)
					{
						exit(); // Exit if we're done
					}
					return; // Stop the loop if we're done
				}
				// If we're not finished
				if (index < iterations)
				{
					index++; // Increment our index
					if (index % 100 === 0)
					{ //clear stack
						setTimeout(function ()
						{
							process(loop); // Run our process, pass in the loop
						}, 1);
					}
					else
					{
						process(loop); // Run our process, pass in the loop
					}
					// Otherwise we're done
				}
				else
				{
					done = true; // Make sure we say we're done
					if (exit)
					{
						exit();
					} // Call the callback on exit
				}
			},
			iteration: function ()
			{
				return index - 1; // Return the loop number we're on
			},
			break: function (end)
			{
				done = true; // End the loop
				shouldExit = end; // Passing end as true means we still call the exit callback
			}
		};
		loop.next();
		return loop;
	},

	balance_supply: async function ()
	{
		const addresses = await Address.find({balance: {$gt: 0}}, 'balance').exec();
		return addresses.reduce((sum, addr) => sum + addr.balance, 0) / 1e8;
	},

	is_unique: function (array, object)
	{
		const index = array.findIndex(item => item.addresses === object);
		return {unique: index === -1, index};
	},

	calculate_total: (vout) => vout.reduce((sum, output) => sum + output.amount, 0),

	prepare_vout: async function (vout, txid, vin, cb)
	{
		const arr_vout = [];
		const arr_vin = vin || [];

		for (const output of vout)
		{
			if (['nonstandard', 'nulldata'].includes(output.scriptPubKey.type))
			{
				continue;
			}

			const address = output.scriptPubKey.addresses?.[0];
			const amount = this.convert_to_satoshi(parseFloat(output.value));

			const {unique, index} = this.is_unique(arr_vout, address);
			if (unique)
			{
				arr_vout.push({addresses: address, amount});
			}
			else
			{
				arr_vout[index].amount += amount;
			}
		}

		if (vout[0]?.scriptPubKey.type === 'nonstandard' && arr_vin.length && arr_vout.length && arr_vin[0].addresses === arr_vout[0].addresses)
		{
			arr_vout[0].amount -= arr_vin[0].amount;
			arr_vin.shift();
		}

		cb(arr_vout,
			arr_vin);
	},

	prepare_vin: async function (tx, cb)
	{
		const arr_vin = [];

		for (const vin of tx.vin)
		{
			const addresses = vin.coinbase ? [{
				hash: 'coinbase',
				amount: tx.vout.reduce((sum, v) => sum + v.value, 0)
			}] : await this.get_input_addresses(vin, tx.vout);
			if (!addresses || !addresses.length)
			{
				continue;
			}

			const {unique, index} = this.is_unique(arr_vin, addresses[0].hash);
			const amount = this.convert_to_satoshi(parseFloat(addresses[0].amount));

			if (unique)
			{
				arr_vin.push({addresses: addresses[0].hash, amount});
			}
			else
			{
				arr_vin[index].amount += amount;
			}
		}

		cb(arr_vin);
	}
};
