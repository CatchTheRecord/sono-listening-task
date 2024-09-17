const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk');

class Audit {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализация KoiiStorageClient
  }

  /**
   * Валидация сабмишена для узла на основе данных, загруженных в IPFS, и данных с сервера.
   * @param {string} submission_value - Сабмишен IPFS CID.
   * @param {number} round - Номер текущего раунда.
   * @returns {Promise<boolean>} - Результат валидации (true - если сабмишен корректен).
   */
  async validateNode(submission_value, round) {
    console.log(`Validating submission for round ${round} and TG_USERNAME: ${process.env.TG_USERNAME}`);
    
    const nodeUsername = process.env.TG_USERNAME;
    if (!nodeUsername) {
      console.error('No TG_USERNAME found in environment variables.');
      return false;
    }

    try {
      // Загружаем данные из IPFS (сабмитированные ранее)
      const submittedData = await this.getDataFromIPFS(submission_value);
      if (!submittedData) {
        console.error('Failed to retrieve data from IPFS for comparison.');
        return false;
      }

      // Получаем свежие данные с сервера
      const currentData = await this.fetchPlayerDataFromEndpoint(nodeUsername);
      if (!currentData) {
        console.error('No data found for user from endpoint:', nodeUsername);
        return false;
      }

      // Сравниваем данные из IPFS и с эндпоинта
      const isValid = this.hasChanges(submittedData, currentData);
      if (isValid) {
        console.log(`Total points have changed for user ${nodeUsername}. Submission is valid.`);
        return true;  // Сабмишен валиден, данные изменились
      } else {
        console.log(`No changes in total points for user ${nodeUsername}. Submission is invalid.`);
        return false; // Сабмишен не валиден, данные не изменились
      }
    } catch (error) {
      console.error('Error during validation:', error);
      return false;
    }
  }

  /**
   * Получение данных из IPFS через KoiiStorageClient.
   * @param {string} cid - CID данных в IPFS.
   * @returns {Promise<Object|null>} - Данные, извлеченные из IPFS, или null в случае ошибки.
   */
  async getDataFromIPFS(cid) {
    try {
      const fileName = 'submittedData.json'; // Имя файла для извлечения данных из IPFS
      const blob = await this.client.getFile(cid, fileName);
      const text = await blob.text();
      const data = JSON.parse(text); // Преобразуем текстовые данные в JSON
      console.log('Data successfully retrieved from IPFS:', data);
      return data;
    } catch (error) {
      console.error('Error fetching data from IPFS:', error);
      return null;
    }
  }

  /**
   * Проверка, изменились ли данные.
   * @param {Object} submittedData - Данные из сабмитированного файла (IPFS).
   * @param {Object} currentData - Текущие данные с сервера.
   * @returns {boolean} - true, если данные изменились, иначе false.
   */
  hasChanges(submittedData, currentData) {
    try {
      console.log(`Comparing total_points: Submitted: ${submittedData.total_points}, Current: ${currentData.total_points}`);
      return submittedData.total_points !== currentData.total_points;
    } catch (error) {
      console.error('Error comparing total_points:', error);
      return false;
    }
  }

  /**
   * Получение данных игрока с эндпоинта.
   * @param {string} username - Имя пользователя.
   * @returns {Promise<Object|null>} - Данные игрока или null.
   */
  async fetchPlayerDataFromEndpoint(username) {
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
      console.error('Error fetching player data from endpoint:', error);
      return null;
    }
  }

  /**
   * Выполнение аудита задачи, проверка изменений total_points для игрока.
   * @param {number} roundNumber - Номер текущего раунда.
   */
  async auditTask(roundNumber) {
    console.log('Starting task audit for TG_USERNAME:', process.env.TG_USERNAME, `in round ${roundNumber}`);
    try {
      await namespaceWrapper.validateAndVoteOnNodes(this.validateNode.bind(this), roundNumber);
      console.log('Task audit completed.');
    } catch (error) {
      console.error('Error during audit:', error);
    }
  }
}

const audit = new Audit();
module.exports = { audit };
