// start ganache with: ganache-cli --seed Phoenix --port 8555
// run tests with: truffle test --network ganache
const Web3 = require('web3') // 1.0.0-beta.34
const web3 = new Web3(Web3.givenProvider || 'http://localhost:8555')
const util = require('ethereumjs-util')

var ClientPhoenixAuthentication = artifacts.require('./ClientPhoenixAuthentication.sol')
var PhoenixToken = artifacts.require('./_testing/PhoenixToken.sol')

contract('ClientPhoenixAuthentication', function (accounts) {
  const owner = {
    public: accounts[0]
  }
  const phoenixOwner = {
    public: accounts[1]
  }
  const user = {
    name: 'Aالعّة汉ελικάZ',
    public: accounts[2],
    private: 'ccc3c84f02b038a5d60d93977ab11eb57005f368b5f62dad29486edeb4566954'
  }
  const delegatedUser = {
    name: 'Noah',
    public: accounts[3],
    private: 'fdf12368f9e0735dc01da9db58b1387236120359024024a31e611e82c8853d7f'
  }
  const badUser = {
    name: 'A'.repeat(50),
    public: accounts[4]
  }
  const rejectedUsers = ['noah', 'Noah', 'nOah', 'noAh', 'noaH', 'NOAH', 'Aالعّة汉ελικάZ']
  const maliciousAdder = {
    public: accounts[5]
  }

  const minimumPhoenixStakeUser = 100
  const minimumPhoenixStakeDelegatedUser = 1000

  const signingMethods = ['unprefixed', 'prefixed']
  const permissionString = 'Create PhoenixAuthenticationClient Phoenix Account'

  var phoenixInstance
  var phoenixAuthenticationInstance

  function sign (message, user, method) {
    return new Promise((resolve, reject) => {
      let messageHash = web3.utils.keccak256(message)
      if (method === 'unprefixed') {
        let signature = util.ecsign(
          Buffer.from(util.stripHexPrefix(messageHash), 'hex'), Buffer.from(user.private, 'hex')
        )
        signature.r = util.bufferToHex(signature.r)
        signature.s = util.bufferToHex(signature.s)
        resolve(signature)
      } else {
        web3.eth.sign(messageHash, user.public)
          .then(concatenatedSignature => {
            let strippedSignature = util.stripHexPrefix(concatenatedSignature)
            let signature = {
              r: util.addHexPrefix(strippedSignature.substr(0, 64)),
              s: util.addHexPrefix(strippedSignature.substr(64, 64)),
              v: parseInt(util.addHexPrefix(strippedSignature.substr(128, 2))) + 27
            }
            resolve(signature)
          })
      }
    })
  }

  it('phoenix token deployed', async function () {
    phoenixInstance = await PhoenixToken.new({from: phoenixOwner.public})
  })

  it('phoenixAuthentication client deployed and linked to the Phoenix token', async function () {
    phoenixAuthenticationInstance = await ClientPhoenixAuthentication.new({from: owner.public})
  })

  it('phoenixAuthentication linked to token', async function () {
    await phoenixAuthenticationInstance.setPhoenixTokenAddress(phoenixInstance.address, {from: owner.public})
    let contractPhoenixTokenAddress = await phoenixAuthenticationInstance.phoenixTokenAddress()
    assert.equal(contractPhoenixTokenAddress, phoenixInstance.address, 'address set incorrectly')
  })

  it('malformed user signups rejected', async function () {
    let signUpPromise = phoenixAuthenticationInstance.signUpUser.call(badUser.name, {from: badUser.public})
      .then(() => { assert.fail('', '', 'user should have been rejected') })
      .catch(error => { assert.include(error.message, 'revert', 'unexpected error') })
    await signUpPromise
  })

  it('user signed up', async function () {
    await phoenixAuthenticationInstance.signUpUser(user.name, {from: user.public})
  })

  it('user details are correct', async function () {
    let userNameTaken = await phoenixAuthenticationInstance.userNameTaken(user.name)
    assert.isTrue(userNameTaken, 'user signed up incorrectly')
    let userDetailsByName = await phoenixAuthenticationInstance.getUserByName(user.name)
    assert.equal(userDetailsByName[0], user.name, 'user name stored incorrectly')
    assert.equal(userDetailsByName[1], user.public, 'user address stored incorrectly')
    let userDetailsByAddress = await phoenixAuthenticationInstance.getUserByAddress(user.public)
    assert.equal(userDetailsByAddress, user.name, 'user name stored incorrectly')
  })

  it('staking minimums are settable', async function () {
    await phoenixAuthenticationInstance.setMinimumPhoenixStakes(
      minimumPhoenixStakeUser, minimumPhoenixStakeDelegatedUser, {from: owner.public}
    )
    let contractMinimumPhoenixStakeUser = await phoenixAuthenticationInstance.minimumPhoenixStakeUser()
    let contractMinimumPhoenixStakeDelegatedUser = await phoenixAuthenticationInstance.minimumPhoenixStakeDelegatedUser()
    assert.equal(contractMinimumPhoenixStakeUser.toNumber(), minimumPhoenixStakeUser, 'fee incorrectly updated')
    assert.equal(
      contractMinimumPhoenixStakeDelegatedUser.toNumber(), minimumPhoenixStakeDelegatedUser, 'fee incorrectly updated'
    )
  })

  it('insufficiently staked delegated user sign up rejected', async function () {
    let signUpPromises = signingMethods.map(method => {
      return sign(permissionString, delegatedUser, method)
        .then(signature => {
          phoenixAuthenticationInstance.signUpDelegatedUser.call(
            delegatedUser.name, delegatedUser.public, signature.v, signature.r, signature.s, {from: owner.public}
          )
            .then(() => { assert.fail('', '', 'delegated user should not have been able to sign up') })
            .catch(error => { assert.include(error.message, 'revert', 'unexpected error') })
        })
        .catch(e => { assert.fail('', '', 'signature error') })
    })
    await Promise.all(signUpPromises)
  })

  it('transferred phoenix tokens', async function () {
    await phoenixInstance.transfer(user.public, minimumPhoenixStakeUser, {from: phoenixOwner.public})
    await phoenixInstance.transfer(owner.public, minimumPhoenixStakeDelegatedUser, {from: phoenixOwner.public})
    await phoenixInstance.transfer(maliciousAdder.public, minimumPhoenixStakeDelegatedUser, {from: phoenixOwner.public})
    let userPhoenixBalance = await phoenixInstance.balanceOf(user.public)
    let ownerPhoenixBalance = await phoenixInstance.balanceOf(owner.public)
    let maliciousAdderPhoenixBalance = await phoenixInstance.balanceOf(maliciousAdder.public)
    assert.equal(userPhoenixBalance.toNumber(), minimumPhoenixStakeUser, 'bad token transfer')
    assert.equal(ownerPhoenixBalance.toNumber(), minimumPhoenixStakeDelegatedUser, 'bad token transfer')
    assert.equal(maliciousAdderPhoenixBalance.toNumber(), minimumPhoenixStakeDelegatedUser, 'bad token transfer')
  })

  it('delegated user signed up', async function () {
    // make sure both types of permissions work
    let signUpPromises = signingMethods.map(method => {
      return sign(permissionString, delegatedUser, method)
        .then(signature => {
          phoenixAuthenticationInstance.signUpDelegatedUser.call(
            delegatedUser.name, delegatedUser.public, signature.v, signature.r, signature.s, {from: owner.public}
          )
            .then(() => {})
            .catch(() => { assert.fail('', '', 'user should have been signed up') })
        })
        .catch(e => { assert.fail('', '', 'signature error') })
    })
    await Promise.all(signUpPromises)
    // arbitrarily submit the unprefixed permission
    let signature = await sign(permissionString, delegatedUser, 'prefixed')
    await phoenixAuthenticationInstance.signUpDelegatedUser(
      delegatedUser.name, delegatedUser.public, signature.v, signature.r, signature.s, {from: owner.public}
    )
  })

  it('delegated user details are correct', async function () {
    let userNameTaken = await phoenixAuthenticationInstance.userNameTaken(delegatedUser.name)
    assert.isTrue(userNameTaken, 'delegated user signed up incorrectly')
    let userDetailsByName = await phoenixAuthenticationInstance.getUserByName(delegatedUser.name)
    assert.equal(userDetailsByName[0], delegatedUser.name, 'delegated user name stored incorrectly')
    assert.equal(userDetailsByName[1], delegatedUser.public, 'delegated user address stored incorrectly')
    let userDetailsByAddress = await phoenixAuthenticationInstance.getUserByAddress(delegatedUser.public)
    assert.equal(userDetailsByAddress, delegatedUser.name, 'delegated user name stored incorrectly')
  })

  it('all added and case-colliding user names should be locked', async function () {
    let lockedNames = [user.name, delegatedUser.name].concat(rejectedUsers)

    let userSignUpPromises = lockedNames.map(lockedName => {
      return phoenixAuthenticationInstance.signUpUser.call(lockedName, {from: maliciousAdder.public})
        .then(() => { assert.fail('', '', 'user should not have been signed up') })
        .catch(() => {})
    })
    await Promise.all(userSignUpPromises)

    let delegatedUserSignUpPromises = signingMethods.map(method => {
      return sign(permissionString, delegatedUser, method)
        .then(signature => {
          phoenixAuthenticationInstance.signUpDelegatedUser.call(
            'shouldBeRejected', delegatedUser.public, signature.v, signature.r, signature.s, {from: maliciousAdder.public}
          )
            .then(() => { assert.fail('', '', 'user should not have been signed up') })
            .catch(() => {})
        })
        .catch(e => { assert.fail('', '', 'signature error') })
    })
    await Promise.all(delegatedUserSignUpPromises)
  })

  it('all addresses with existing accounts should not be able to add another', async function () {
    let newName = 'Alter Ego'
    let userPromise = phoenixAuthenticationInstance.signUpUser(newName, {from: user.public})
      .then(() => { assert.fail('', '', 'user should not have been signed up') })
      .catch(() => {})
    let delegatedUserPromise = phoenixAuthenticationInstance.signUpUser(newName, {from: delegatedUser.public})
      .then(() => { assert.fail('', '', 'user should not have been signed up') })
      .catch(() => {})
    await Promise.all([userPromise, delegatedUserPromise])
  })

  let challengeString = '123456'
  let challengeStringHash = web3.utils.keccak256(challengeString)

  it('should be able to recover signed messages', async function () {
    let signers = [user, delegatedUser]
    signers.forEach(async signer => {
      signingMethods.forEach(async method => {
        let signature = await sign(challengeString, signer, method)
        let isSigned = await phoenixAuthenticationInstance.isSigned.call(
          signer.public, challengeStringHash, signature.v, signature.r, signature.s
        )
        assert.isTrue(isSigned, 'address signature unconfirmed')
      })
    })
  })

  it('users deleted', async function () {
    await phoenixAuthenticationInstance.deleteUser({from: user.public})
    await phoenixAuthenticationInstance.deleteUser({from: delegatedUser.public})
  })
})
