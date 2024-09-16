const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Submission {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализация KoiiStorageClient
  }

  /**
   * Основной метод задачи Koii для обработки данных игрока и обновления их в кэше.
   * @param {number} round - Номер текущего раунда.
   */
  async task(round) {
    console.log(`Task started for round ${round}`);

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

    // Проверяем, изменились ли данные total_points и обновляем кэш
    const hasChanged = await this.checkAndUpdateCache(playerData, round);
    if (hasChanged) {
      console.log(`Player total_points has changed, uploading data to IPFS for round ${round}...`);
      await this.uploadDataToIPFS(playerData, round); // Загружаем данные в IPFS
    } else {
      console.log(`No changes detected for player total_points in round ${round}.`);
    }
  }

  /**
   * Сабмишен данных.
   * @param {number} round - Номер текущего раунда.
   */
  async submitTask(round) {
    console.log(`Submitting task for round ${round}`);

    const submission = await this.fetchSubmission(round);
    if (submission) {
      console.log('Data found for submission:', submission);
      await namespaceWrapper.checkSubmissionAndUpdateRound(submission, round);
      console.log(`Task submitted successfully with CID: ${submission}`);
    } else {
      console.error(`No data to submit for round ${round}.`);
    }
  }

  /**
   * Получение данных игрока с сервера.
   * @param {string} username - Имя пользователя.
   * @returns {Promise<Object|null>} - Данные игрока или null, если данные не найдены.
   */
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

  /**
   * Проверяет изменение total_points и обновляет кэш с привязкой к раунду.
   * @param {Object} playerData - Данные игрока.
   * @param {number} round - Номер текущего раунда.
   * @returns {Promise<boolean>} - true, если данные изменились, false, если не изменились.
   */
  async checkAndUpdateCache(playerData, round) {
    try {
      const cacheKey = `player_data_${playerData.username}_round_${round}`;
      const cachedData = await namespaceWrapper.storeGet(cacheKey);

      // Если есть данные в кэше, проверяем изменения
      if (cachedData) {
        const cachedPlayerData = JSON.parse(cachedData);

        if (cachedPlayerData.total_points !== playerData.total_points) {
          // Если данные изменились, обновляем кэш
          await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
          return true;
        } else {
          return false; // Данные не изменились
        }
      } else {
        // Если данных в кэше нет, сохраняем их
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        return true;
      }
    } catch (error) {
      console.error('Error comparing or caching player data:', error);
      return false;
    }
  }

  /**
   * Загрузка данных игрока в IPFS.
   * @param {Object} playerData - Данные игрока.
   * @param {number} round - Номер текущего раунда.
   */
  async uploadDataToIPFS(playerData, round) {
    try {
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, `playerData_${playerData.username}_round_${round}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ total_points: playerData.total_points }));

      const userStaking = await namespaceWrapper.getSubmitterAccount();
      
      // Загрузка данных в IPFS и получение CID
      const uploadResponse = await this.client.uploadFile(filePath, userStaking);
      const newCid = uploadResponse.cid;
      console.log('New data uploaded to IPFS with CID:', newCid);

      // Сохраняем новый CID в кэш для последующей проверки
      const cacheKey = `player_points_${playerData.username}_round_${round}`;
      await namespaceWrapper.storeSet(cacheKey, newCid);
    } catch (error) {
      console.error('Error uploading data to IPFS:', error);
    }
  }

  /**
   * Получение данных для сабмишена с привязкой к раунду.
   * @param {number} round - Номер текущего раунда.
   */
  async fetchSubmission(round) {
    console.log('Fetching submission data...');
    const cacheKey = `player_points_${process.env.TG_USERNAME}_round_${round}`;
    const cachedCid = await namespaceWrapper.storeGet(cacheKey);
    return cachedCid || null;
  }
}

const submission = new Submission();
module.exports = { submission };
