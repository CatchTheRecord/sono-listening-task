const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk'); // Используем KoiiStorageClient для работы с IPFS

class Audit {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализируем KoiiStorageClient
  }

  /**
   * Validate the node's submission.
   * @param {string} submission_value - The submitted IPFS CID.
   * @returns {Promise<boolean>} - Result of the validation.
   */
  async validateNode(submission_value) {
    console.log(`Validating submission for TG_USERNAME: ${process.env.TG_USERNAME}`);

    const nodeUsername = process.env.TG_USERNAME;
    if (!nodeUsername) {
      console.error('No TG_USERNAME found in environment variables.');
      return false;
    }

    // Retrieve cached player data using cacheKeys
    const cachedPlayerData = await this.fetchCachedPlayerData(nodeUsername);
    if (!cachedPlayerData) {
      console.error('No cached data available for the user:', nodeUsername);
      return false;
    }

    // Download submitted data from IPFS for comparison
    const submittedData = await this.downloadDataFromIPFS(submission_value);
    if (!submittedData) {
      console.error('Failed to retrieve data from IPFS for comparison.');
      return false;
    }

    // Compare the `total_points` from the cached data and the submitted data
    const isValid = this.compareTotalPoints(cachedPlayerData, submittedData);
    if (isValid) {
      console.log(`Data has changed for user ${nodeUsername}. Submission passed validation.`);
      return true;
    } else {
      console.log(`No significant changes detected for user ${nodeUsername}.`);
      return true; // Even if no change is detected, we consider the submission valid.
    }
  }

  /**
   * Compare the `total_points` between cached and submitted data.
   * @param {Object} cachedData - The cached player data.
   * @param {Object} submittedData - The submitted player data.
   * @returns {boolean} - True if `total_points` has changed, otherwise false.
   */
  compareTotalPoints(cachedData, submittedData) {
    try {
      // Compare total_points between cached and submitted data
      console.log(`Comparing total_points: Cached: ${cachedData.total_points}, Submitted: ${submittedData.total_points}`);
      return cachedData.total_points !== submittedData.total_points;
    } catch (error) {
      console.error('Error comparing total_points:', error);
      return false;
    }
  }

  /**
   * Retrieve cached player data for a specific user.
   * @param {string} username - The player's username.
   * @returns {Promise<Object|null>} - The cached player data or null if not found.
   */
  async fetchCachedPlayerData(username) {
    try {
      // Retrieve cacheKeys
      let cacheKeys = await namespaceWrapper.storeGet('cacheKeys');
      cacheKeys = cacheKeys ? JSON.parse(cacheKeys) : [];

      const cacheKey = cacheKeys.find(key => key.includes(username));
      if (!cacheKey) {
        console.error(`No cache key found for username: ${username}`);
        return null;
      }

      // Retrieve cached data for the specific user
      const cachedData = await namespaceWrapper.storeGet(cacheKey);
      return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
      console.error('Error fetching cached player data:', error);
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
   * Execute the audit task for checking `total_points` changes for TG_USERNAME.
   */
  async auditTask() {
    console.log('Starting task audit for TG_USERNAME:', process.env.TG_USERNAME);
    try {
      // Perform validation
      await namespaceWrapper.validateAndVoteOnNodes(this.validateNode.bind(this));
      console.log('Task audit completed.');
    } catch (error) {
      console.error('Error during audit:', error);
    }
  }
}

const audit = new Audit();
module.exports = { audit };
