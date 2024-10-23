const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk'); // Import KoiiStorageClient
const path = require('path');
const os = require('os');
const fs = require('fs');

class Submission {
  constructor() {
    this.client = new KoiiStorageClient(); // Initialize KoiiStorageClient
  }

  /**
   * Koii task for fetching player data associated with TG_USERNAME.
   * @param {number} round - Round number
   */
  async task(round) {
    console.log(`Task started for round: ${round}`);

    // Retrieve TG_USERNAME from environment variables
    const username = process.env.TG_USERNAME;
    if (!username) {
      console.error('TG_USERNAME environment variable is not set.');
      return;
    }

    console.log(`Fetching data for user: ${username}`);

    // Fetch player data for the specific username
    const playerData = await this.getPlayerDataForUser(username);

    if (!playerData) {
      console.log(`No data found for user: ${username}`);
      return;
    }

    console.log(`Data received for user: ${username}`, playerData);

    // Cache player data if updated
    const isUpdated = await this.cachePlayerDataIfUpdated(playerData);

    if (isUpdated) {
      console.log(`Player data for ${username} has been modified and updated in the cache.`);
    } else {
      console.log(`No changes in data for ${username}.`);
    }
  }

  /**
   * Fetch player data for a specific user from your server API.
   * @param {string} username - Username for which to fetch data
   * @returns {Promise<Object|null>} - Player data or null if not found
   */
  async getPlayerDataForUser(username) {
    try {
      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('Server response error:', response.statusText);
        return null;
      }

      const playersData = await response.json();
      // Find the player data that matches the username
      return playersData.find(player => player.username === username) || null;
    } catch (error) {
      console.error('Error fetching data from the server:', error);
      return null;
    }
  }

  /**
   * Cache player data on the Koii node if the data has changed.
   * @param {Object} playerData - Player data (username, points, level, relics, etc.)
   * @returns {Promise<boolean>} - Returns true if the data was updated, otherwise false.
   */
  async cachePlayerDataIfUpdated(playerData) {
    try {
      const cacheKey = `player_data_${playerData.username}`;
      const cachedData = await namespaceWrapper.storeGet(cacheKey);

      if (cachedData) {
        const cachedPlayerData = JSON.parse(cachedData);

        // Compare data: if changed, update the cache
        if (this.isPlayerDataChanged(cachedPlayerData, playerData)) {
          await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
          await this.addKeyToCacheList(cacheKey);
          return true; // Data changed and was updated
        } else {
          return false; // Data remained the same
        }
      } else {
        // If no data is cached, store it
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        await this.addKeyToCacheList(cacheKey);
        return true; // New data was saved
      }
    } catch (error) {
      console.error('Error caching player data:', error);
      return false;
    }
  }

  /**
   * Add a key to the list of cached data if it's not already present.
   * @param {string} key - Cache key.
   */
  async addKeyToCacheList(key) {
    try {
      let cacheKeys = await namespaceWrapper.storeGet('cacheKeys');
      cacheKeys = cacheKeys ? JSON.parse(cacheKeys) : [];

      if (!cacheKeys.includes(key)) {
        cacheKeys.push(key);
        await namespaceWrapper.storeSet('cacheKeys', JSON.stringify(cacheKeys));
      }
    } catch (error) {
      console.error('Error adding key to cache list:', error);
    }
  }

  /**
   * Check if player data has changed.
   * @param {Object} cachedData - Cached data
   * @param {Object} newData - New data
   * @returns {boolean} - True if data changed, otherwise false
   */
  isPlayerDataChanged(cachedData, newData) {
    return (
      cachedData.total_points !== newData.total_points ||
      cachedData.level !== newData.level ||
      JSON.stringify(cachedData.relics) !== JSON.stringify(newData.relics)
    );
  }

  /**
   * Submit data to IPFS and send it to the server for verification, only if data changed.
   * @param {number} round - Round number
   */
  async submitTask(round) {
    try {
      // Retrieve TG_USERNAME from environment variables
      const username = process.env.TG_USERNAME;
      if (!username) {
        console.error('TG_USERNAME environment variable is not set.');
        return;
      }

      // Retrieve cached player data for the specific user
      const cacheKey = `player_data_${username}`;
      const cachedPlayerData = await namespaceWrapper.storeGet(cacheKey);

      if (!cachedPlayerData) {
        console.log(`No cached data found for user: ${username}`);
        return;
      }

      const playerData = JSON.parse(cachedPlayerData);

      // Ensure player data is up-to-date before submission
      const isUpdated = await this.cachePlayerDataIfUpdated(playerData);
      if (!isUpdated) {
        console.log('Data has not changed. No submission will be made.');
        return; // Skip submission if data hasn't changed
      }

      // Upload data to IPFS via KoiiStorageClient
      const userStaking = await namespaceWrapper.getSubmitterAccount();
      const ipfsCid = await this.uploadToIPFS([playerData], userStaking); // Submit only this user's data
      console.log('Data uploaded to IPFS, CID:', ipfsCid);

      // Submit CID to the server for verification
      await namespaceWrapper.checkSubmissionAndUpdateRound(ipfsCid, round);
      console.log('Submission completed with CID:', ipfsCid);

    } catch (error) {
      console.error('Error submitting data to the server:', error);
    }
  }

  /**
   * Upload data to IPFS via KoiiStorageClient with retry attempts on failure.
   * @param {Array} data - Data to upload to IPFS
   * @param {Object} userStaking - User staking information
   * @param {number} retries - Number of retry attempts in case of failure (default is 3)
   * @returns {Promise<string>} - CID of uploaded data
   */
  async uploadToIPFS(data, userStaking, retries = 3) {
    const tempDir = os.tmpdir(); // Use temporary directory
    const filePath = path.join(tempDir, 'cachedPlayersData.json'); // Path to temporary file

    fs.writeFileSync(filePath, JSON.stringify(data)); // Temporarily save data

    while (retries > 0) {
      try {
        const fileUploadResponse = await this.client.uploadFile(filePath, userStaking);
        return fileUploadResponse.cid; // Return CID
      } catch (error) {
        if (retries > 1 && error.message.includes('503')) {
          console.log('Error uploading data to IPFS, retrying in 5 seconds...');
          retries--;
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
        } else {
          console.error('Error uploading data to IPFS:', error);
          throw error;
        }
      }
    }
  }
}

const submission = new Submission();
module.exports = { submission };
