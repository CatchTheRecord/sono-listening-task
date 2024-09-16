const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk'); // Используем KoiiStorageClient для работы с IPFS

class Audit {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализируем KoiiStorageClient
  }

  /**
   * Validate the node's submission.
   * @param {string} submission_value - The submitted IPFS CID.
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

    // Retrieve cached CID from the previous round
    const cachedCid = await this.fetchCachedCid(round - 1);
    if (!cachedCid) {
      console.error('No cached CID available for validation.');
      return false;
    }

    // Download data from both cached and submitted CIDs for comparison
    const cachedData = await this.downloadDataFromIPFS(cachedCid);
    const submittedData = await this.downloadDataFromIPFS(submission_value);

    if (!cachedData || !submittedData) {
      console.error('Failed to retrieve data from IPFS for comparison.');
      return false;
    }

    // Compare the `total_points` from the cached data and the submitted data
    const isValid = this.comparePlayerData(cachedData, submittedData);
    if (isValid) {
      console.log(`Data has changed for user ${nodeUsername} in round ${round}. Submission passed validation.`);
      return true;
    } else {
      console.log(`No significant changes detected in the data for user ${nodeUsername} in round ${round}.`);
      return false;
    }
  }

  /**
   * Compare the player data between cached and submitted versions.
   * @param {Object} cachedData - The cached player data.
   * @param {Object} submittedData - The submitted player data.
   * @returns {boolean} - True if the data has changed, false otherwise.
   */
  comparePlayerData(cachedData, submittedData) {
    try {
      // Compare total_points between cached and submitted data
      console.log(`Comparing total_points: Cached: ${cachedData.total_points}, Submitted: ${submittedData.total_points}`);
      return cachedData.total_points !== submittedData.total_points;
    } catch (error) {
      console.error('Error comparing player data:', error);
      return false;
    }
  }

  /**
   * Retrieve cached CID from the previous round.
   * @param {number} round - The previous round number.
   * @returns {Promise<string|null>} - The cached CID or null if not found.
   */
  async fetchCachedCid(round) {
    try {
      const nodeUsername = process.env.TG_USERNAME;
      if (!nodeUsername) {
        console.error('No TG_USERNAME found in environment variables.');
        return null;
      }

      const cacheKey = `player_points_${nodeUsername}_${round}`;
      console.log(`Fetching cached CID with key: ${cacheKey}`);

      const cachedData = await namespaceWrapper.storeGet(cacheKey);
      if (!cachedData) {
        console.error(`No cached CID found for key: ${cacheKey}`);
        return null;
      }

      return cachedData; // Возвращаем кэшированный CID
    } catch (error) {
      console.error('Error fetching cached CID:', error);
      return null;
    }
  }

  /**
   * Download player data from IPFS using the provided CID.
   * @param {string} cid - The CID for retrieving data from IPFS.
   * @returns {Promise<Object|null>} - The downloaded data as an object or null if an error occurs.
   */
  async downloadDataFromIPFS(cid) {
    try {
      // Загружаем данные по CID из IPFS
      const fileData = await this.client.downloadFile(cid);
      const parsedData = JSON.parse(fileData);
      console.log('Data retrieved from IPFS:', parsedData);
      return parsedData;
    } catch (error) {
      console.error('Error downloading data from IPFS:', error);
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
