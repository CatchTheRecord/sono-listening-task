const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Submission {
  async task(round) {
    console.log(`Task started for round: ${round}`);

    const username = process.env.TG_USERNAME;
    if (!username) {
      console.error('Environment variable TG_USERNAME not found. Please set TG_USERNAME.');
      return;
    }

    console.log(`Fetching data for user: ${username}`);
    const playerData = await this.fetchPlayerDataForUser(username);
    if (!playerData) {
      console.log(`Player data not found for user: ${username}`);
      return;
    }

    console.log(`Player data received for user: ${username}`, playerData);

    const isUpdated = await this.cachePlayerDataIfChanged(playerData, round);
    if (isUpdated) {
      console.log(`Player data for ${username} has changed and updated in cache for round ${round}.`);
    } else {
      console.log(`Player data for ${username} remained unchanged for round ${round}.`);
    }
  }

  async fetchPlayerDataForUser(username) {
    const playersData = await this.fetchPlayerDataWithRetry();
    if (playersData && playersData.length) {
      return playersData.find(player => player.username === username);
    }
    return null;
  }

  async fetchPlayerDataWithRetry() {
    try {
      const playersData = await this.getPlayerDataFromServer();
      if (playersData) return playersData;
      
      console.log('First attempt to fetch data failed, retrying...');
      await this.delay(5000); // 5-second delay before retrying
      return await this.getPlayerDataFromServer();
    } catch (error) {
      console.error('Error fetching player data:', error);
      return [];
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getPlayerDataFromServer() {
    try {
      console.log('Sending request to fetch player data from server');
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
      console.error('Error fetching data from server:', error);
      return [];
    }
  }

  async cachePlayerDataIfChanged(playerData, round) {
    try {
      const cacheKey = `player_data_${playerData.username}_${round}`;
      const previousRoundKey = `player_data_${playerData.username}_${round - 1}`;

      console.log(`Checking cache data from previous round ${round - 1}`);
      const cachedData = await this.safeCacheGet(previousRoundKey);

      if (cachedData && !this.isDataChanged(cachedData, playerData)) {
        console.log(`Player data did not change for round ${round}.`);
        return false;
      }

      console.log(`Updating cache for round ${round}`);
      await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
      const savedData = await namespaceWrapper.storeGet(cacheKey);
      if (savedData) {
        console.log(`Data successfully saved to cache for round ${round}`);
      } else {
        console.error(`Error saving data to cache for round ${round}`);
      }
      return true;
    } catch (error) {
      console.error('Error caching player data:', error);
      return false;
    }
  }

  async safeCacheGet(key) {
    try {
      return await namespaceWrapper.storeGet(key);
    } catch (error) {
      console.error(`Error fetching data from cache with key ${key}:`, error);
      return null;
    }
  }

  isDataChanged(cachedData, newData) {
    console.log('Comparing cached data with new data...');
    return JSON.stringify(cachedData) !== JSON.stringify(newData);
  }

  async submitTask(round) {
    console.log(`Submitting task for round ${round}`);
    const submission = await this.fetchSubmission(round);
    if (submission) {
      await namespaceWrapper.checkSubmissionAndUpdateRound(submission, round);
      console.log(`Task submitted and round updated for round ${round}`);
    } else {
      console.error(`No data to submit for round ${round}`);
    }
  }

  async fetchSubmission(round) {
    const submissionKey = `player_data_${process.env.TG_USERNAME}_${round}`;
    const value = await this.safeCacheGet(submissionKey);
    if (value) {
      console.log('Data found for submission:', value);
      return value;
    }
    console.warn(`No data to submit for round ${round}`);
    return null;
  }
}

const submission = new Submission();
module.exports = { submission };
