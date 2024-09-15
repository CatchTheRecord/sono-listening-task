const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Submission {
  /**
   * Koii task for tracking the user's radio listening activity.
   * @param {number} round - Round number
   */
  async task(round) {
    console.log(`Task started for round: ${round}`);

    // Fetch the node operator's username from the environment variables
    const username = process.env.TG_USERNAME; // The username is set as a task variable

    if (!username) {
      console.error('No username found. Please set the TG_USERNAME environment variable.');
      return;
    }

    console.log(`Fetching data for username: ${username}`);

    // Fetch player data from your server endpoint for the specific username
    const playerData = await this.getPlayerDataFromServer(username);

    if (!playerData) {
      console.log(`No player data available for user: ${username}`);
      return;
    }

    console.log(`Player data fetched for user: ${username}`, playerData);

    // Cache data for the user's listening activity on the Koii node
    const isUpdated = await this.cachePlayerListeningDataIfUpdated(playerData, round);

    if (isUpdated) {
      console.log(`Player data for ${username} has been modified and updated in the cache for round ${round}.`);
    } else {
      console.log(`Player data for ${username} remains unchanged for round ${round}.`);
    }
  }

  /**
   * Fetch player listening data for a specific user from your server API.
   * @param {string} username - The username of the player
   * @returns {Promise<Object|null>} - Player data object or null if not found
   */
  async getPlayerDataFromServer(username) {
    try {
      console.log(`Sending request to fetch data for user: ${username}`);
      
      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }) // Pass the username to the server
      });

      if (!response.ok) {
        console.error('Server response error:', response.statusText);
        return null;
      }

      const playerData = await response.json();
      console.log('Data fetched from server:', playerData);
      return playerData;
    } catch (error) {
      console.error('Error fetching data from the server:', error);
      return null;
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

      const cachedData = await namespaceWrapper.storeGet(previousRoundKey);

      if (cachedData) {
        const cachedPlayerData = JSON.parse(cachedData);
        console.log(`Cached data found for previous round:`, cachedPlayerData);

        // Compare total_points with the previous round: if changed, update the cache
        if (this.isPlayerListeningDataChanged(cachedPlayerData, playerData)) {
          console.log(`Player data has changed. Updating cache for round ${round} with key: ${cacheKey}`);
          await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
          return true; // Data changed and was updated
        } else {
          console.log(`Player data has not changed for round ${round}.`);
          return false; // Data remained the same
        }
      } else {
        console.log(`No cached data found for previous round. Saving current data for round ${round}.`);
        // If no data for the previous round is cached, store the current data
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        return true; // New data was saved
      }
    } catch (error) {
      console.error('Error caching player data:', error);
      return false;
    }
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
    // Fetch the cached value from the current round
    const submissionKey = `player_data_${process.env.TG_USERNAME}_${round}`;
    const value = await namespaceWrapper.storeGet(submissionKey); // Retrieves the value
    console.log('Fetched submission value:', value);
    return value;
  }
}

const submission = new Submission();
module.exports = { submission };
