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

      // Process submissions and calculate rewards for players with valid changes
      for (const playerPublicKey of submissionKeys) {
        const playerSubmission = submissions[playerPublicKey];
        const isValidSubmission = this.checkIfSubmissionHasChanges(playerSubmission);

        if (isValidSubmission) {
          validPlayers.push(playerPublicKey);
        }
      }

      // Calculate rewards and ensure maximum reward of 25 tokens per player
      if (validPlayers.length > 0) {
        const totalBounty = taskStakeListJSON.bounty_amount_per_round;
        const maxRewardPerPlayer = 25; // Set max reward limit to 25 tokens

        // Calculate the reward per valid player
        const reward = Math.floor(totalBounty / validPlayers.length);

        for (const validPlayer of validPlayers) {
          // If calculated reward exceeds the maximum, set it to the maximum
          distributionList[validPlayer] = reward > maxRewardPerPlayer ? maxRewardPerPlayer : reward;
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
   * Check if a submission contains any changes in player data (validates change in total_points).
   * @param {object} submission - Player's submission
   * @returns {boolean} Result of the check for data changes
   */
  checkIfSubmissionHasChanges(submission) {
    // Check if total_points exist and if there is any change
    return submission.total_points !== undefined && submission.total_points > 0;
  }

  /**
   * Audit the distribution list for the current round
   * @param {number} roundNumber - The current round number
   * @returns {void}
   */
  async auditDistribution(roundNumber) {
    console.log('Auditing distribution list for round:', roundNumber);
    await namespaceWrapper.validateAndVoteOnDistributionList(this.validateDistribution, roundNumber);
  }

  /**
   * Validate the distribution list submitted by another node
   * @param {string} distributionListSubmitter - Public key of the submitter of the distribution list
   * @param {number} round - The round number
   * @returns {Promise<boolean>} Result of the validation (true if the list is valid)
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

      // Compare the distribution lists
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
   * Compare two objects for equality
   * @param {object} obj1 - First object
   * @param {object} obj2 - Second object
   * @returns {boolean} Result of the comparison
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
