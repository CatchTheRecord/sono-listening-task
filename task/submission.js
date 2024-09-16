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

    // Проверка на изменение данных
    const hasChanged = await this.checkAndUpdateCache(playerData, round);
    if (hasChanged) {
      console.log(`Player data has changed, rewarding player...`);
      this.rewardPlayer(playerData); // Добавляем начисление награды
    } else {
      console.log(`No changes detected for player data.`);
    }
  }

  async fetchPlayerDataForUser(username) {
    try {
      console.log('Fetching player data from server...');
      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('Failed to fetch player data:', response.statusText);
        return null;
      }

      const playersData = await response.json();
      return playersData.find(player => player.username === username) || null;
    } catch (error) {
      console.error('Error fetching player data:', error);
      return null;
    }
  }

  async checkAndUpdateCache(playerData) {
    try {
      const cacheKey = `player_data_${playerData.username}`;
      const cachedData = await namespaceWrapper.storeGet(cacheKey);

      // Если данные изменились — обновляем кеш и возвращаем true
      if (!cachedData || JSON.stringify(cachedData) !== JSON.stringify(playerData)) {
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        return true; // Данные изменились
      }

      return false; // Данные не изменились
    } catch (error) {
      console.error('Error comparing or caching player data:', error);
      return false;
    }
  }

  rewardPlayer(playerData) {
    console.log(`Rewarding player ${playerData.username} for changes in data...`);
    // Логика начисления награды. Здесь можно реализовать любые действия, связанные с наградой.
    // Например, обновление баланса, отправка токенов и т.д.
  }

  async submitTask(round) {
    console.log(`Submitting task for round ${round}`);
    const submissionKey = `player_data_${process.env.TG_USERNAME}`;
    const value = await namespaceWrapper.storeGet(submissionKey);
    if (value) {
      console.log('Data found for submission:', value);
      await namespaceWrapper.checkSubmissionAndUpdateRound(value, round);
      console.log(`Task submitted for round ${round}`);
    } else {
      console.error(`No data to submit for round ${round}`);
    }
  }
}

const submission = new Submission();
module.exports = { submission };
