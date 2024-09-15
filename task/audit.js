const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Audit {
  constructor() {
    // IPFS и другие внешние клиенты не нужны для текущей задачи.
  }

  /**
   * Validate the activity for the node.
   * @param {string} submission_value - The value representing the player's activity.
   * @param {number} round - The round number.
   * @returns {Promise<boolean>} - Result of the validation.
   */
  async validateNode(submission_value, round) {
    console.log(`Validating submission for round ${round}`);
    try {
      // Извлекаем username из переменной среды
      const nodeUsername = process.env.TG_USERNAME;
      if (!nodeUsername) {
        console.error('No TG_USERNAME found in environment variables.');
        return false;
      }

      // Retrieve cached player data for the current node's user from the previous round
      const cachedData = await this.fetchCachedPlayerData(round - 1); // Fetch data from the previous round

      if (!cachedData) {
        console.error('No cached data available for validation.');
        return false;
      }

      // Проверяем, что username совпадает
      if (cachedData.username !== nodeUsername) {
        console.error(`Username mismatch: cached username is ${cachedData.username}, but TG_USERNAME is ${nodeUsername}`);
        return false;
      }

      // Validate the submission value (expected to be total_points or activity data)
      const isValid = this.hasChanges(cachedData, submission_value);

      if (isValid) {
        console.log(`Player's activity for user ${nodeUsername} has changed in round ${round}. Submission passed validation.`);
      } else {
        console.log(`No changes detected in player activity for user ${nodeUsername} in round ${round}. Submission passed validation.`);
      }

      return true; // Consider it valid regardless of whether data changed
    } catch (error) {
      console.error('Error during validation:', error);
      return false;
    }
  }

  /**
   * Check if player data has changed (based on total_points or other activity).
   * @param {Object} cachedData - Cached player data.
   * @param {Object} submission_value - New data representing player's current activity (e.g., total_points).
   * @returns {boolean} - True if data has changed, otherwise false.
   */
  hasChanges(cachedData, submission_value) {
    try {
      let submittedData;
      try {
        submittedData = JSON.parse(submission_value); // Ensure that the submission value is valid JSON
      } catch (jsonError) {
        console.error('Error parsing submission value:', jsonError);
        return false;
      }

      console.log('Comparing cached data with submitted data:');
      console.log('Cached data:', cachedData);
      console.log('Submitted data:', submittedData);

      // Compare cached total_points with the submitted total_points
      return cachedData.total_points !== submittedData.total_points;
    } catch (error) {
      console.error('Error comparing data:', error);
      return false;
    }
  }

  /**
   * Retrieve cached player data from the node's storage for the previous round.
   * @param {number} round - Previous round number
   * @returns {Promise<Object|null>} - Cached player data or null if not found.
   */
  async fetchCachedPlayerData(round) {
    try {
      const nodeUsername = process.env.TG_USERNAME;
      if (!nodeUsername) {
        console.error('No TG_USERNAME found in environment variables.');
        return null;
      }

      const cacheKey = `player_data_${nodeUsername}_${round}`;
      console.log(`Fetching cached data with key: ${cacheKey}`);

      const cachedData = await namespaceWrapper.storeGet(cacheKey);
      if (!cachedData) {
        console.error(`No cached data found for key: ${cacheKey}`);
        return null;
      }

      return JSON.parse(cachedData); // Parse cached data
    } catch (error) {
      console.error('Error retrieving data from cache:', error);
      return null;
    }
  }

  /**
   * Execute the task audit for a specific round.
   * @param {number} roundNumber - The round number.
   */
  async auditTask(roundNumber) {
    console.log(`Starting task audit for round ${roundNumber}`);
    try {
      await namespaceWrapper.validateAndVoteOnNodes(
        this.validateNode.bind(this),
        roundNumber
      );
      console.log(`Task audit for round ${roundNumber} completed.`);
    } catch (error) {
      console.error(`Error during audit for round ${roundNumber}:`, error);
    }
  }
}

const audit = new Audit();
module.exports = { audit };
