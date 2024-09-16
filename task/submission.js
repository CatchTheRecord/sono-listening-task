const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Submission {
  /**
   * Koii task for tracking the user's radio listening activity.
   * @param {number} round - Round number
   */
  async task(round) {
    console.log(`Task started for round: ${round}`);

    // Fetch the node operator's username from the environment variables
    const username = process.env.TG_USERNAME;

    if (!username) {
      console.error('No TG_USERNAME found. Please set the TG_USERNAME environment variable.');
      return;
    }

    console.log(`Fetching data for username: ${username}`);

    // Fetch player data from your server endpoint
    const playersData = await this.fetchPlayerDataWithRetry();

    if (!playersData || playersData.length === 0) {
      console.log('No player data available for processing.');
      return;
    }

    // Фильтруем данные для конкретного пользователя
    const playerData = playersData.find(player => player.username === username);

    if (!playerData) {
      console.log(`No player data available for user: ${username}`);
      return;
    }

    console.log(`Player data fetched for user: ${playerData.username}`, playerData);

    // Cache data for the user's listening activity on the Koii node
    const isUpdated = await this.cachePlayerListeningDataIfUpdated(playerData, round);

    if (isUpdated) {
      console.log(`Player data for ${playerData.username} has been modified and updated in the cache for round ${round}.`);
    } else {
      console.log(`Player data for ${playerData.username} remains unchanged for round ${round}.`);
    }
  }

  /**
   * Attempt to fetch player data with a retry on failure.
   * @returns {Promise<Array>} - Array of player data or null if not found
   */
  async fetchPlayerDataWithRetry() {
    try {
      const playersData = await this.getPlayerDataFromServer();
      if (playersData) {
        return playersData;
      }
      console.log('First attempt to fetch data failed, retrying...');
      // If first attempt fails, wait and retry once
      await this.delay(5000); // Delay for 5 seconds
      return await this.getPlayerDataFromServer();
    } catch (error) {
      console.error('Both attempts to fetch player data failed:', error);
      return [];
    }
  }

  /**
   * Delays execution for a given number of milliseconds.
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>} - Promise resolved after the delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch all players' listening data from your server API.
   * @returns {Promise<Array>} - Array of player data
   */
  async getPlayerDataFromServer() {
    try {
      console.log('Sending request to fetch player data from the server');

      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('Server response error:', response.statusText);
        return [];
      }

      const playersData = await response.json();
      return playersData || [];
    } catch (error) {
      console.error('Error fetching data from the server:', error);
      return [];
    }
  }

  /**
   * Cache player listening data on the Koii node if the data has changed.
   * @param {Object} playerData - Player data (username, total_points, etc.)
   * @param {number} round - Round number
   * @returns {Promise<boolean>} - Returns true if the data was updated, otherwise false.
   */
  async cachePlayerListeningDataIfUpdated(playerData, round) {
    try {
      const cacheKey = `player_data_${playerData.username}_${round}`;
      const previousRoundKey = `player_data_${playerData.username}_${round - 1}`;

      console.log(`Checking for previous data from round ${round - 1} with key: ${previousRoundKey}`);

      const cachedData = await this.safeCacheGet(previousRoundKey);  // Используем новый метод для безопасного извлечения

      if (cachedData) {
        const cachedPlayerData = JSON.parse(cachedData);
        console.log(`Cached data found for previous round:`, cachedPlayerData);

        // Compare total_points with the previous round: if changed, update the cache
        if (this.isPlayerListeningDataChanged(cachedPlayerData, playerData)) {
          console.log(`Player data has changed. Updating cache for round ${round} with key: ${cacheKey}`);
          await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
          await this.logCacheSetSuccess(cacheKey); // Log successful cache set

          // Log for verifying that the data is correctly saved
          const savedData = await namespaceWrapper.storeGet(cacheKey);
          if (savedData) {
            console.log(`Verified saved data for round ${round}:`, JSON.parse(savedData));
          } else {
            console.error(`Failed to verify saved data for round ${round}`);
          }

          return true; // Data changed and was updated
        } else {
          console.log(`Player data has not changed for round ${round}.`);
          return false; // Data remained the same
        }
      } else {
        console.log(`No cached data found for previous round. Saving current data for round ${round}.`);
        // If no data for the previous round is cached, store the current data
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        await this.logCacheSetSuccess(cacheKey); // Log successful cache set

        // Log for verifying that the data is correctly saved
        const savedData = await namespaceWrapper.storeGet(cacheKey);
        if (savedData) {
          console.log(`Verified saved data for round ${round}:`, JSON.parse(savedData));
        } else {
          console.error(`Failed to verify saved data for round ${round}`);
        }

        return true; // New data was saved
      }
    } catch (error) {
      console.error('Error caching player data:', error);
      return false;
    }
  }

  /**
   * Safe cache retrieval with error handling.
   * @param {string} cacheKey - The key for the cached data.
   * @returns {Promise<string|null>} - Cached data or null if not found.
   */
  async safeCacheGet(cacheKey) {
    try {
      const cachedData = await namespaceWrapper.storeGet(cacheKey);
      if (!cachedData) {
        console.log(`No cached data found for key: ${cacheKey}`);
        return null;
      }
      return cachedData;
    } catch (error) {
      console.error(`Error retrieving cache for key ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Logs a successful cache set.
   * @param {string} cacheKey - The key of the cached data.
   */
  async logCacheSetSuccess(cacheKey) {
    console.log(`Successfully cached data with key: ${cacheKey}`);
  }

  /**
   * Check if player total_points have changed.
   * @param {Object} cachedData - Cached data
   * @param {Object} newData - New data
   * @returns {boolean} - True if total_points changed, otherwise false
   */
  isPlayerListeningDataChanged(cachedData, newData) {
    console.log('Comparing cached data with new data.');
    return cachedData.total_points !== newData.total_points;
  }

  /**
   * Submits a task for a given round
   * @param {number} round - The current round number
   * @returns {Promise<any>} The submission value that you will use in audit. Ex. CID of the IPFS file
   */
  async submitTask(round) {
    console.log('Submitting task for round:', round);
    try {
      const submission = await this.fetchSubmission(round);

      if (!submission) {
        console.error(`No submission data available for round: ${round}`);
        return;
      }

      console.log('Submitting data to the blockchain:', submission);
      await namespaceWrapper.checkSubmissionAndUpdateRound(submission, round);
      console.log('Submission checked and round updated');
      return submission;
    } catch (error) {
      console.error('Error during submission:', error);
    }
  }

  /**
   * Fetches the submission value
   * @param {number} round - The current round number
   * @returns {Promise<string>} The submission value that you will use in audit. It can be the real value, cid, etc.
   */
  async fetchSubmission(round) {
    console.log(`Fetching submission for round: ${round}`);
    const submissionKey = `player_data_${process.env.TG_USERNAME}_${round}`;
    const value = await this.safeCacheGet(submissionKey);  // Используем безопасное извлечение данных
    if (value) {
      console.log('Fetched submission value:', value);
    } else {
      console.warn(`No submission data found for round: ${round}`);
    }
    return value;
  }
}

const submission = new Submission();
module.exports = { submission };
