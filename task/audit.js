const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Audit {
  /**
   * Validate the node's submission.
   * @param {string} submission_value - The submitted value (points).
   * @param {number} round - The current round number.
   * @returns {Promise<boolean>} - Result of the validation.
   */
  async validateNode(submission_value, round) {
    console.log(`Validating submission for round ${round}`);

    const nodeUsername = process.env.TG_USERNAME;
    if (!nodeUsername) {
      console.error('No TG_USERNAME found in environment variables.');
      return false;
    }

    // Retrieve cached player data from the previous round
    const cachedData = await this.fetchCachedPlayerData(round - 1);
    if (!cachedData) {
      console.error('No cached data available for validation.');
      return false;
    }

    // Compare the submission data with the cached data
    const isValid = this.hasPointsChanged(cachedData, submission_value);
    if (isValid) {
      console.log(`Player's points have changed for user ${nodeUsername} in round ${round}. Submission passed validation.`);
    } else {
      console.log(`No changes in points for user ${nodeUsername} in round ${round}.`);
    }

    return isValid;
  }

  /**
   * Check if player points have changed.
   * @param {Object} cachedData - Cached player data from the previous round.
   * @param {string} submission_value - The submitted data in JSON format.
   * @returns {boolean} - True if points have changed, otherwise false.
   */
  hasPointsChanged(cachedData, submission_value) {
    try {
      const submittedData = JSON.parse(submission_value);

      console.log('Comparing cached total_points with submitted total_points:');
      console.log('Cached total_points:', cachedData.total_points);
      console.log('Submitted total_points:', submittedData.total_points);

      return cachedData.total_points !== submittedData.total_points;
    } catch (error) {
      console.error('Error comparing total_points:', error);
      return false;
    }
  }

  /**
   * Retrieve cached player data from the previous round.
   * @param {number} round - The previous round number.
   * @returns {Promise<Object|null>} - The cached player data or null if not found.
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

      return JSON.parse(cachedData);
    } catch (error) {
      console.error('Error fetching cached data:', error);
      return null;
    }
  }

  /**
   * Execute the audit task for a specific round.
   * @param {number} roundNumber - The round number.
   */
  async auditTask(roundNumber) {
    console.log(`Starting task audit for round ${roundNumber}`);
    try {
      await namespaceWrapper.validateAndVoteOnNodes(this.validateNode.bind(this), roundNumber);
      console.log(`Task audit for round ${roundNumber} completed.`);
    } catch (error) {
      console.error(`Error during audit for round ${roundNumber}:`, error);
    }
  }
}

const audit = new Audit();
module.exports = { audit };
