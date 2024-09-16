const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Distribution {
  /**
   * Generate and submit the distribution list for the current round
   * @param {number} round - The current round number
   * @returns {void}
   */
  submitDistributionList = async (round) => {
    console.log('Submitting distribution list for round', round);
    try {
      const distributionList = await this.generateDistributionList(round);
      if (Object.keys(distributionList).length === 0) {
        console.log('Failed to generate the distribution list');
        return;
      }

      // Submit the distribution list to the blockchain via Koii
      const decider = await namespaceWrapper.uploadDistributionList(distributionList, round);
      if (decider) {
        const response = await namespaceWrapper.distributionListSubmissionOnChain(round);
        console.log('Response after submitting distribution list:', response);
      }
    } catch (err) {
      console.error('Error submitting distribution list:', err);
    }
  };

  /**
   * Generate the distribution list for the current round
   * @param {number} round - The current round number
   * @returns {Promise<object>} Distribution list for the given round
   */
  async generateDistributionList(round) {
    try {
      console.log('Generating distribution list for round', round);
      let distributionList = {};
      let validPlayers = [];

      // Fetch submission data for the current round
      let taskAccountDataJSON = await namespaceWrapper.getTaskSubmissionInfo(round);
      if (!taskAccountDataJSON) {
        console.error('Error fetching submission data');
        return distributionList;
      }

      const submissions = taskAccountDataJSON.submissions[round];
      if (!submissions) {
        console.log(`No submissions for round ${round}`);
        return distributionList;
      }

      const submissionKeys = Object.keys(submissions);
      const taskStakeListJSON = await namespaceWrapper.getTaskState({ is_stake_list_required: true });
      if (!taskStakeListJSON) {
        console.error('Error fetching stake list');
        return distributionList;
      }

      // Проверка изменений в данных сабмишенов
      for (const playerPublicKey of submissionKeys) {
        const playerSubmission = submissions[playerPublicKey];
        const isValidSubmission = this.checkIfSubmissionHasChanges(playerSubmission);

        if (isValidSubmission) {
          validPlayers.push(playerPublicKey);
        } else {
          // Если сабмишен невалиден, уменьшаем ставку игрока
          const playerStake = taskStakeListJSON.stake_list[playerPublicKey];
          const slashedStake = playerStake * 0.7;
          distributionList[playerPublicKey] = -slashedStake;
          console.log('Penalty for player:', playerPublicKey, slashedStake);
        }
      }

      // Распределение наград между игроками с валидными сабмишенами
      if (validPlayers.length > 0) {
        const totalBounty = taskStakeListJSON.bounty_amount_per_round;
        const maxRewardPerPlayer = 25; // Устанавливаем лимит награды в 25 токенов

        // Вычисляем награду для каждого валидного игрока
        const reward = Math.floor(totalBounty / validPlayers.length);

        for (const validPlayer of validPlayers) {
          // Если рассчитанная награда превышает максимум, устанавливаем её в maxRewardPerPlayer
          distributionList[validPlayer] = Math.min(reward, maxRewardPerPlayer);
          console.log(`Reward for player ${validPlayer}: ${distributionList[validPlayer]} (capped at ${maxRewardPerPlayer})`);
        }
      }

      console.log('Final distribution list:', distributionList);
      return distributionList;
    } catch (err) {
      console.error('Error generating distribution list:', err);
      return {};
    }
  }

  /**
   * Проверка, изменились ли данные сабмишена.
   * @param {object} submission - Сабмишен игрока
   * @returns {boolean} Результат проверки на изменения
   */
  checkIfSubmissionHasChanges(submission) {
    // Валидация данных: если сабмишен содержит данные, считаем его валидным
    return submission && Object.keys(submission).length > 0;
  }

  /**
   * Аудит дистрибуционного списка для текущего раунда
   * @param {number} roundNumber - номер раунда
   * @returns {void}
   */
  async auditDistribution(roundNumber) {
    console.log('Auditing distribution list for round:', roundNumber);
    await namespaceWrapper.validateAndVoteOnDistributionList(this.validateDistribution, roundNumber);
  }

  /**
   * Валидация дистрибуционного списка, поданного другим узлом
   * @param {string} distributionListSubmitter - Публичный ключ узла, подавшего дистрибуционный список
   * @param {number} round - Номер раунда
   * @returns {Promise<boolean>} Результат валидации (true, если список валиден)
   */
  validateDistribution = async (distributionListSubmitter, round) => {
    try {
      const rawDistributionList = await namespaceWrapper.getDistributionList(distributionListSubmitter, round);
      if (!rawDistributionList) {
        console.log(`Distribution list not found for round ${round}`);
        return true;
      }

      const fetchedDistributionList = JSON.parse(rawDistributionList);
      const generatedDistributionList = await this.generateDistributionList(round);

      // Сравнение списков дистрибуции
      const isValid = this.shallowEqual(fetchedDistributionList, generatedDistributionList);
      if (isValid) {
        console.log('Distribution list successfully validated.');
      } else {
        console.error('Error: Distribution list failed validation.');
      }
      return isValid;
    } catch (error) {
      console.error('Error validating distribution list:', error);
      return false;
    }
  };

  /**
   * Сравнение двух объектов на равенство
   * @param {object} obj1 - Первый объект
   * @param {object} obj2 - Второй объект
   * @returns {boolean} Результат сравнения
   */
  shallowEqual(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    for (let key of keys1) {
      if (obj1[key] !== obj2[key]) {
        return false;
      }
    }
    return true;
  }
}

const distribution = new Distribution();
module.exports = { distribution };
