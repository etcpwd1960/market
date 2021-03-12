import React, { ReactElement, useEffect, useState } from 'react'
import { useOcean } from '@oceanprotocol/react'
import { Logger } from '@oceanprotocol/lib'
import styles from './index.module.css'
import stylesActions from './Actions.module.css'
import PriceUnit from '../../../atoms/Price/PriceUnit'
import Button from '../../../atoms/Button'
import Add from './Add'
import Remove from './Remove'
import Tooltip from '../../../atoms/Tooltip'
import EtherscanLink from '../../../atoms/EtherscanLink'
import Token from './Token'
import TokenList from './TokenList'
import { graphql, useStaticQuery } from 'gatsby'
import TokenBalance from '../../../../@types/TokenBalance'
import Transactions from './Transactions'
import Graph from './Graph'
import { useAsset } from '../../../../providers/Asset'
import { gql, useQuery } from '@apollo/client'
import { PoolLiquidity } from '../../../../@types/apollo/PoolLiquidity'

const contentQuery = graphql`
  query PoolQuery {
    content: allFile(filter: { relativePath: { eq: "price.json" } }) {
      edges {
        node {
          childContentJson {
            pool {
              tooltips {
                price
                liquidity
              }
            }
          }
        }
      }
    }
  }
`
const poolLiquidityQuery = gql`
  query PoolLiquidity($id: ID!, $shareId: ID) {
    pool(id: $id) {
      id
      totalShares
      swapFee
      tokens {
        tokenAddress
        balance
        denormWeight
      }
      shares(where: { id: $shareId }) {
        id
        balance
      }
    }
  }
`

export default function Pool(): ReactElement {
  const data = useStaticQuery(contentQuery)
  const content = data.content.edges[0].node.childContentJson.pool

  const { ocean, accountId, networkId } = useOcean()
  const { isInPurgatory, ddo, owner, price, refreshInterval } = useAsset()
  const dtSymbol = ddo?.dataTokenInfo.symbol

  const [poolTokens, setPoolTokens] = useState<string>()
  const [totalPoolTokens, setTotalPoolTokens] = useState<string>()
  const [userLiquidity, setUserLiquidity] = useState<TokenBalance>()
  const [swapFee, setSwapFee] = useState<string>()
  const [weightOcean, setWeightOcean] = useState<string>()
  const [weightDt, setWeightDt] = useState<string>()

  const [showAdd, setShowAdd] = useState(false)
  const [showRemove, setShowRemove] = useState(false)
  const [isRemoveDisabled, setIsRemoveDisabled] = useState(false)

  const [hasAddedLiquidity, setHasAddedLiquidity] = useState(false)
  const [poolShare, setPoolShare] = useState<string>()
  const [totalUserLiquidityInOcean, setTotalUserLiquidityInOcean] = useState(0)
  const [totalLiquidityInOcean, setTotalLiquidityInOcean] = useState(0)

  const [
    creatorTotalLiquidityInOcean,
    setCreatorTotalLiquidityInOcean
  ] = useState(0)
  const [creatorLiquidity, setCreatorLiquidity] = useState<TokenBalance>()
  const [creatorPoolTokens, setCreatorPoolTokens] = useState<string>()
  const [creatorPoolShare, setCreatorPoolShare] = useState<string>()

  // the purpose of the value is just to trigger the effect
  const [refreshPool, setRefreshPool] = useState(false)
  const { data: dataLiquidity } = useQuery<PoolLiquidity>(poolLiquidityQuery, {
    variables: {
      id: ddo.price.address.toLowerCase(),
      shareId: `${ddo.price.address.toLowerCase()}-${ddo.publicKey[0].owner.toLowerCase()}`
    },
    pollInterval: 5000
  })

  useEffect(() => {
    async function init() {
      if (!dataLiquidity || !dataLiquidity.pool) return

      // Total pool shares
      const totalPoolTokens = dataLiquidity.pool.totalShares
      setTotalPoolTokens(totalPoolTokens)

      // Get swap fee
      // swapFee is tricky: to get 0.1% you need to convert from 0.001
      setSwapFee(`${Number(dataLiquidity.pool.swapFee) * 100}`)

      // Get weights
      const weightDt = dataLiquidity.pool.tokens.filter(
        (token: any) => token.tokenAddress === ddo.dataToken.toLowerCase()
      )[0].denormWeight

      setWeightDt(`${Number(weightDt) * 10}`)
      setWeightOcean(`${100 - Number(weightDt) * 10}`)

      //
      // Get everything the creator put into the pool
      //

      const creatorPoolTokens = dataLiquidity.pool.shares[0].balance
      setCreatorPoolTokens(creatorPoolTokens)

      // Calculate creator's provided liquidity based on pool tokens
      const creatorOceanBalance =
        (Number(creatorPoolTokens) / Number(totalPoolTokens)) * price.ocean

      const creatorDtBalance =
        (Number(creatorPoolTokens) / Number(totalPoolTokens)) * price.datatoken

      const creatorLiquidity = {
        ocean: creatorOceanBalance,
        datatoken: creatorDtBalance
      }
      setCreatorLiquidity(creatorLiquidity)

      const totalCreatorLiquidityInOcean =
        creatorLiquidity?.ocean + creatorLiquidity?.datatoken * price?.value
      setCreatorTotalLiquidityInOcean(totalCreatorLiquidityInOcean)
      const creatorPoolShare =
        price?.ocean &&
        price?.datatoken &&
        creatorLiquidity &&
        ((Number(creatorPoolTokens) / Number(totalPoolTokens)) * 100).toFixed(2)
      setCreatorPoolShare(creatorPoolShare)
    }
    init()
  }, [dataLiquidity, ddo.dataToken, price.datatoken, price.ocean, price?.value])

  useEffect(() => {
    setIsRemoveDisabled(isInPurgatory && owner === accountId)
  }, [isInPurgatory, owner, accountId])

  useEffect(() => {
    const poolShare =
      price?.ocean &&
      price?.datatoken &&
      ((Number(poolTokens) / Number(totalPoolTokens)) * 100).toFixed(5)
    setPoolShare(poolShare)
    setHasAddedLiquidity(Number(poolShare) > 0)

    const totalUserLiquidityInOcean =
      userLiquidity?.ocean + userLiquidity?.datatoken * price?.value
    setTotalUserLiquidityInOcean(totalUserLiquidityInOcean)
    const totalLiquidityInOcean = price?.ocean + price?.datatoken * price?.value
    setTotalLiquidityInOcean(totalLiquidityInOcean)
  }, [userLiquidity, price, poolTokens, totalPoolTokens])

  useEffect(() => {
    if (!ocean || !accountId || !price) return
    async function init() {
      try {
        //
        // Get everything the user has put into the pool
        //
        const poolTokens = await ocean.pool.sharesBalance(
          accountId,
          price.address
        )
        setPoolTokens(poolTokens)
        // calculate user's provided liquidity based on pool tokens
        const userOceanBalance =
          (Number(poolTokens) / Number(totalPoolTokens)) * price.ocean
        const userDtBalance =
          (Number(poolTokens) / Number(totalPoolTokens)) * price.datatoken
        const userLiquidity = {
          ocean: userOceanBalance,
          datatoken: userDtBalance
        }

        setUserLiquidity(userLiquidity)
      } catch (error) {
        Logger.error(error.message)
      }
    }
    init()
  }, [ocean, accountId, price, ddo, refreshPool, owner, totalPoolTokens])

  const refreshInfo = async () => {
    setRefreshPool(!refreshPool)
    // await refreshPrice()
  }

  return (
    <>
      {showAdd ? (
        <Add
          setShowAdd={setShowAdd}
          refreshInfo={refreshInfo}
          poolAddress={price.address}
          totalPoolTokens={totalPoolTokens}
          totalBalance={{
            ocean: price.ocean,
            datatoken: price.datatoken
          }}
          swapFee={swapFee}
          dtSymbol={dtSymbol}
          dtAddress={ddo.dataToken}
        />
      ) : showRemove ? (
        <Remove
          setShowRemove={setShowRemove}
          refreshInfo={refreshInfo}
          poolAddress={price.address}
          poolTokens={poolTokens}
          totalPoolTokens={totalPoolTokens}
          dtSymbol={dtSymbol}
        />
      ) : (
        <>
          <div className={styles.dataToken}>
            <PriceUnit price="1" symbol={dtSymbol} /> ={' '}
            <PriceUnit price={`${price?.value}`} />
            <Tooltip content={content.tooltips.price} />
            <div className={styles.dataTokenLinks}>
              <EtherscanLink
                networkId={networkId}
                path={`address/${price?.address}`}
              >
                Pool
              </EtherscanLink>
              <EtherscanLink
                networkId={networkId}
                path={`token/${ddo.dataToken}`}
              >
                Datatoken
              </EtherscanLink>
            </div>
          </div>

          <TokenList
            title={
              <>
                Your Liquidity
                <Tooltip
                  content={content.tooltips.liquidity.replace(
                    'SWAPFEE',
                    swapFee
                  )}
                />
              </>
            }
            ocean={`${userLiquidity?.ocean}`}
            dt={`${userLiquidity?.datatoken}`}
            dtSymbol={dtSymbol}
            poolShares={poolTokens}
            conversion={totalUserLiquidityInOcean}
            highlight
          >
            <Token symbol="% of pool" balance={poolShare} noIcon />
          </TokenList>

          <TokenList
            title="Pool Creator Liquidity"
            ocean={`${creatorLiquidity?.ocean}`}
            dt={`${creatorLiquidity?.datatoken}`}
            dtSymbol={dtSymbol}
            poolShares={creatorPoolTokens}
            conversion={creatorTotalLiquidityInOcean}
          >
            <Token symbol="% of pool" balance={creatorPoolShare} noIcon />
          </TokenList>

          <TokenList
            title={
              <>
                Pool Statistics
                {weightDt && (
                  <span
                    className={styles.titleInfo}
                    title={`Weight of ${weightOcean}% OCEAN & ${weightDt}% ${dtSymbol}`}
                  >
                    {weightOcean}/{weightDt}
                  </span>
                )}
                <Graph />
              </>
            }
            ocean={`${price?.ocean}`}
            dt={`${price?.datatoken}`}
            dtSymbol={dtSymbol}
            poolShares={totalPoolTokens}
            conversion={totalLiquidityInOcean}
          >
            <Token symbol="% swap fee" balance={swapFee} noIcon />
          </TokenList>

          {ocean && (
            <div className={styles.update}>
              Fetching every {refreshInterval / 1000} sec.
            </div>
          )}

          <div className={stylesActions.actions}>
            {!isInPurgatory && (
              <Button
                style="primary"
                size="small"
                onClick={() => setShowAdd(true)}
                disabled={isInPurgatory}
              >
                Add Liquidity
              </Button>
            )}

            {hasAddedLiquidity && !isRemoveDisabled && (
              <Button size="small" onClick={() => setShowRemove(true)}>
                Remove
              </Button>
            )}
          </div>

          {accountId && <Transactions />}
        </>
      )}
    </>
  )
}
