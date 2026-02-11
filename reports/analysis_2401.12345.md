# Analysis: Distributionally Robust Receive Combining

**ArXiv ID:** 2401.12345
**Authors:** Shixiong Wang, Wei Dai, Geoffrey Ye Li
**Date:** 2024-01-22
**Categories:** eess.SP

## Abstract
This article investigates signal estimation in wireless transmission (i.e., receive combining) from the perspective of statistical machine learning, where the transmit signals may be from an integrated sensing and communication system; that is, 1) signals may be not only discrete constellation points but also arbitrary complex values; 2) signals may be spatially correlated. Particular attention is paid to handling various uncertainties such as the uncertainty of the transmit signal covariance, the uncertainty of the channel matrix, the uncertainty of the channel noise covariance, the existence of channel impulse noises, the non-ideality of the power amplifiers, and the limited sample size of pilots. To proceed, a distributionally robust receive combining framework that is insensitive to the above uncertainties is proposed, which reveals that channel estimation is not a necessary operation. For optimal linear estimation, the proposed framework includes several existing combiners as special cases such as diagonal loading and eigenvalue thresholding. For optimal nonlinear estimation, estimators are limited in reproducing kernel Hilbert spaces and neural network function spaces, and corresponding uncertainty-aware solutions (e.g., kernelized diagonal loading) are derived. In addition, we prove that the ridge and kernel ridge regression methods in machine learning are distributionally robust against diagonal perturbation in feature covariance.

## Summary

The paper addresses the problem of signal estimation in wireless transmission (receive combining) from an integrated sensing and communication system, where uncertainties such as transmit signal covariance, channel matrix, and noise covariance exist.
To handle these uncertainties, the paper proposes a distributionally robust receive combining framework that is insensitive to them, which reveals that channel estimation is not necessary. The framework includes existing combiners as special cases for optimal linear estimation and derives uncertainty-aware solutions for optimal nonlinear estimation.

## Classification
- **Topic:** other
- **Confidence:** 80%
- **Keywords:** wireless transmission, signal estimation, receive combining, statistical machine learning

## Entities
- **Methods:** Distributionally Robust Receive Combining, Diagonal Loading, Eigenvalue Thresholding, Ridge Regression, Kernel Ridge Regression, Kernelized Diagonal Loading
