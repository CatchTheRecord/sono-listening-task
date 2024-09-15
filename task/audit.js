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
      // Retrieve cached player data for the current node's user
      const cachedData = await this.fetchCachedPlayerData();

      if (!cachedData) {
        console.error('No cached data available for validation.');
        return false;
      }

      // Here, submission_value is expected to be the new total_points or activity data
      const isChanged = this.hasChanges(cachedData, submission_value);

      if (isChanged) {
        console.log(`Player's activity changed in round ${round}. Submission passed validation.`);
      } else {
        console.log(`No activity changes in round ${round}. Submission passed validation.`);
      }

      return true; // Regardless of whether data changed, consider it valid
    } catch (error) {
      console.error('Error during validation:', error);
      return false;
    }
  }

  /**
   * Check if player data has changed (based on total_points or other activity).
   * @param {Object} cachedData - Cached player data.
   * @param {Object} newData - New data representing player's current activity (e.g., total_points).
   * @returns {boolean} - True if data has changed, otherwise false.
   */
  hasChanges(cachedData, newData) {
    // Compare cached total_points with the submitted total_points
    return cachedData.total_points !== newData.total_points;
  }

  /**
   * Retrieve cached player data from the node's storage.
   * @returns {Promise<Object|null>} - Cached player data or null if not found.
   */
  async fetchCachedPlayerData() {
    try {
      // Fetch the player's username from environment variables
      const username = process.env.USERNAME; // The username provided by the node operator
      const cacheKey = `player_data_${username}`;

      const cachedData = await namespaceWrapper.storeGet(cacheKey);
      if (!cachedData) {
        console.error('No cached data found for the player.');
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
    await namespaceWrapper.validateAndVoteOnNodes(
      this.validateNode.bind(this),
      roundNumber
    );
    console.log(`Task audit for round ${roundNumber} completed.`);
  }
}

const audit = new Audit();
module.exports = { audit };
