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
   */
  async task() {
    console.log(`Task started`);

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
    const hasChanged = await this.checkAndUpdateCache(playerData);
    if (hasChanged) {
      console.log(`Player total_points has changed, rewarding player...`);
      this.rewardPlayer(playerData);
    } else {
      console.log(`No changes detected for player total_points.`);
    }
  }

  /**
   * Получение данных игрока с сервера.
   * @param {string} username - имя пользователя.
   * @returns {Promise<Object|null>} - данные игрока или null, если данные не найдены.
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
   * Проверяет изменение total_points и обновляет кэш.
   * @param {Object} playerData - данные игрока.
   * @returns {Promise<boolean>} - true, если данные изменились, false, если не изменились.
   */
  async checkAndUpdateCache(playerData) {
    try {
      const cacheKey = `player_data_${playerData.username}`;
      const cachedData = await namespaceWrapper.storeGet(cacheKey);

      // Если есть данные в кэше, проверяем изменения
      if (cachedData) {
        const cachedPlayerData = JSON.parse(cachedData);

        if (cachedPlayerData.total_points !== playerData.total_points) {
          // Если данные изменились, обновляем кэш и загружаем в IPFS
          await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
          await this.uploadDataToIPFS(playerData);
          return true;
        } else {
          return false; // Данные не изменились
        }
      } else {
        // Если данных в кэше нет, сохраняем их
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        await this.uploadDataToIPFS(playerData);
        return true;
      }
    } catch (error) {
      console.error('Error comparing or caching player data:', error);
      return false;
    }
  }

  /**
   * Загрузка данных игрока в IPFS.
   * @param {Object} playerData - данные игрока.
   */
  async uploadDataToIPFS(playerData) {
    try {
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, `playerData_${playerData.username}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ total_points: playerData.total_points }));

      const userStaking = await namespaceWrapper.getSubmitterAccount();
      
      // Загрузка данных в IPFS и получение CID
      const uploadResponse = await this.client.uploadFile(filePath, userStaking);
      const newCid = uploadResponse.cid;
      console.log('New data uploaded to IPFS with CID:', newCid);

      // Сохраняем новый CID в кэш для последующей проверки
      const cacheKey = `player_points_${process.env.TG_USERNAME}`;
      await namespaceWrapper.storeSet(cacheKey, newCid);
    } catch (error) {
      console.error('Error uploading data to IPFS:', error);
    }
  }

  /**
   * Начисление награды игроку.
   * @param {Object} playerData - данные игрока.
   */
  rewardPlayer(playerData) {
    console.log(`Rewarding player ${playerData.username} for changes in total_points...`);
    // Здесь можно добавить логику начисления награды
  }

  /**
   * Сабмишен данных.
   */
  async submitTask() {
    console.log(`Submitting task`);

    const submissionKey = `player_points_${process.env.TG_USERNAME}`;
    const cachedCid = await namespaceWrapper.storeGet(submissionKey);

    if (cachedCid) {
      console.log('Data found for submission:', cachedCid);
      await namespaceWrapper.checkSubmissionAndUpdateRound(cachedCid);
      console.log(`Task submitted successfully with CID: ${cachedCid}`);
    } else {
      console.error(`No data to submit.`);
    }
  }
}

const submission = new Submission();
module.exports = { submission };
